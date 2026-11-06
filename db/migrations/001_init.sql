-- Bank Manager: accounts and the banking system of record.
-- Targets Postgres 16+ (local Docker now, Lakebase later); nothing here is Databricks-specific.

CREATE SCHEMA account;
CREATE SCHEMA bank;

-- ---------------------------------------------------------------------------
-- account: sign-in. Email addresses and password hashes live only here.
-- ---------------------------------------------------------------------------
CREATE TABLE account.player (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_key         uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),   -- opaque key used by the bank schema
  email              text NOT NULL,
  password_hash      text NOT NULL,                                    -- Argon2id
  email_confirmed_at timestamptz,
  consent_at         timestamptz,                                      -- has seen the recording notice
  analysis_opt_out   boolean NOT NULL DEFAULT false,                   -- keep games out of analysis
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX player_email_key ON account.player (lower(email));

CREATE TABLE account.session (
  token_hash text PRIMARY KEY,                                         -- sha-256 of the cookie value
  player_id  uuid NOT NULL REFERENCES account.player(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX session_player ON account.session (player_id);

CREATE TABLE account.token (                                           -- emailed links: confirm address, reset password
  token_hash text PRIMARY KEY,
  player_id  uuid NOT NULL REFERENCES account.player(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('confirm', 'reset')),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);

CREATE TABLE account.login_attempt (                                   -- failed sign-ins, for rate limiting
  id       bigserial PRIMARY KEY,
  email    text NOT NULL,
  ip       text NOT NULL,
  at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_attempt_recent ON account.login_attempt (lower(email), at);

CREATE TABLE account.outbox (                                          -- emails the local mailer "sent" (dev only)
  id         bigserial PRIMARY KEY,
  recipient  text NOT NULL,
  subject    text NOT NULL,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- bank: one schema, every table keyed by game_id (indexes lead on it).
-- ---------------------------------------------------------------------------
CREATE TABLE bank.game (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_key     uuid NOT NULL,                                        -- points at account.player.player_key, no name or email
  mode           text NOT NULL DEFAULT 'branch',
  scenario       text,
  tutorial       boolean NOT NULL DEFAULT false,
  seed           integer NOT NULL,
  engine_version integer NOT NULL,
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished', 'failed')),
  last_seq       integer NOT NULL DEFAULT 0,
  synthetic      boolean NOT NULL DEFAULT true,                        -- all data is invented
  in_analysis    boolean NOT NULL DEFAULT true,                        -- false when the player opted out
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX game_player ON bank.game (player_key, created_at DESC);

CREATE TABLE bank.command (                                            -- the replay source: seed + engine version + these, in order
  game_id    uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  seq        integer NOT NULL,
  type       text NOT NULL,
  payload    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, seq)
);

CREATE TABLE bank.game_state (                                         -- latest engine state, for fast load
  game_id    uuid PRIMARY KEY REFERENCES bank.game(id) ON DELETE CASCADE,
  seq        integer NOT NULL,
  -- json, not jsonb: jsonb reorders object keys, and the engine's floating-point sums depend on key order,
  -- so a reloaded game could drift by a rounding error from the one that was replayed.
  state      json NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bank.event (                                              -- what the engine reported happening
  game_id     uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  id          bigserial,
  command_seq integer NOT NULL,
  year        integer NOT NULL,
  month       integer NOT NULL,
  kind        text NOT NULL,                                           -- 'outcome' (a decision's result) or 'month' (month-end news)
  tone        text NOT NULL DEFAULT '',
  text        text NOT NULL,
  PRIMARY KEY (game_id, id)
);

CREATE TABLE bank.gl_account (                                         -- chart of accounts
  code        text PRIMARY KEY,
  name        text NOT NULL,
  type        text NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'income', 'expense')),
  normal_side text NOT NULL CHECK (normal_side IN ('debit', 'credit'))
);

CREATE TABLE bank.journal_entry (
  game_id     uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  seq         integer NOT NULL,                                        -- the engine's entry number
  command_seq integer NOT NULL,
  year        integer NOT NULL,
  month       integer NOT NULL,
  memo        text NOT NULL,
  PRIMARY KEY (game_id, seq)
);

CREATE TABLE bank.journal_line (
  game_id      uuid NOT NULL,
  entry_seq    integer NOT NULL,
  line_no      smallint NOT NULL,
  account      text NOT NULL REFERENCES bank.gl_account(code),
  amount_pence bigint NOT NULL,                                        -- debit positive, credit negative
  PRIMARY KEY (game_id, entry_seq, line_no),
  FOREIGN KEY (game_id, entry_seq) REFERENCES bank.journal_entry(game_id, seq) ON DELETE CASCADE
);

-- An entry that does not sum to zero cannot be committed.
CREATE FUNCTION bank.check_entry_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE total bigint; g uuid; s integer;
BEGIN
  IF TG_OP = 'DELETE' THEN g := OLD.game_id; s := OLD.entry_seq; ELSE g := NEW.game_id; s := NEW.entry_seq; END IF;
  SELECT COALESCE(SUM(amount_pence), 0) INTO total FROM bank.journal_line WHERE game_id = g AND entry_seq = s;
  IF total <> 0 AND EXISTS (SELECT 1 FROM bank.journal_entry WHERE game_id = g AND seq = s) THEN
    RAISE EXCEPTION 'journal entry % of game % does not balance (off by % pence)', s, g, total USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER journal_line_balanced AFTER INSERT OR UPDATE OR DELETE ON bank.journal_line
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION bank.check_entry_balanced();

-- Entries and their lines are append-only.
CREATE FUNCTION bank.no_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN COALESCE(OLD, NEW); END IF;   -- allow ON DELETE CASCADE from game deletion
  RAISE EXCEPTION 'bank.% is append-only', TG_TABLE_NAME USING ERRCODE = '42501';
END $$;
CREATE TRIGGER journal_line_append_only BEFORE UPDATE ON bank.journal_line FOR EACH ROW EXECUTE FUNCTION bank.no_rewrite();
CREATE TRIGGER journal_entry_append_only BEFORE UPDATE ON bank.journal_entry FOR EACH ROW EXECUTE FUNCTION bank.no_rewrite();

CREATE TABLE bank.decision (                                           -- each choice paired with the truth the engine knew
  game_id     uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  command_seq integer NOT NULL,
  card_id     integer NOT NULL,
  kind        text NOT NULL,
  year        integer NOT NULL,
  month       integer NOT NULL,
  decided_by  text NOT NULL DEFAULT 'player',
  options     jsonb NOT NULL,                                          -- the options shown
  chosen      text NOT NULL,
  truth       jsonb NOT NULL,                                          -- the hidden facts behind the case
  PRIMARY KEY (game_id, command_seq)
);

CREATE TABLE bank.position_snapshot (                                  -- month-end balance of every ledger account
  game_id      uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  year         integer NOT NULL,
  month        integer NOT NULL,
  account      text NOT NULL REFERENCES bank.gl_account(code),
  balance_pence bigint NOT NULL,
  PRIMARY KEY (game_id, year, month, account)
);

CREATE TABLE bank.regulatory_snapshot (                                -- month-end capital, liquidity and standing
  game_id         uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  year            integer NOT NULL,
  month           integer NOT NULL,
  capital_ratio   numeric(9, 6) NOT NULL,
  liquidity_ratio numeric(9, 6) NOT NULL,
  trust           numeric(6, 2) NOT NULL,
  regulator       numeric(6, 2) NOT NULL,
  profit_pence    bigint NOT NULL,                                     -- profit for the month
  PRIMARY KEY (game_id, year, month)
);

INSERT INTO bank.gl_account (code, name, type, normal_side) VALUES
  ('cash',            'Cash and reserves at the Bank of England', 'asset',     'debit'),
  ('gilts',           'Gilts (book value)',                       'asset',     'debit'),
  ('legacy',          'Older loan book',                          'asset',     'debit'),
  ('loans',           'Loans to customers',                       'asset',     'debit'),
  ('deposits',        'Customer deposits',                        'liability', 'credit'),
  ('cb',              'Bank of England borrowing',                'liability', 'credit'),
  ('equity.opening',  'Opening capital',                          'equity',    'credit'),
  ('equity.paidin',   'Share capital raised',                     'equity',    'credit'),
  ('pl.intLoans',     'Interest on loans',                        'income',    'credit'),
  ('pl.intGilts',     'Interest on gilts',                        'income',    'credit'),
  ('pl.intRes',       'Interest on reserves',                     'income',    'credit'),
  ('pl.intDep',       'Interest paid to savers',                  'expense',   'debit'),
  ('pl.intCB',        'Bank of England borrowing cost',           'expense',   'debit'),
  ('pl.fees',         'Fees',                                     'income',    'credit'),
  ('pl.wealth',       'Wealth management fees',                   'income',    'credit'),
  ('pl.losses',       'Credit losses',                            'expense',   'debit'),
  ('pl.redress',      'Fraud, refunds and fines',                 'expense',   'debit'),
  ('pl.costs',        'Running costs',                            'expense',   'debit'),
  ('pl.gilts',        'Gains and losses on asset sales',          'income',    'credit');

-- Reference vocabulary (FIBO), recorded as comments rather than as the physical design.
COMMENT ON TABLE bank.game              IS 'Game metadata. Not a FIBO concept.';
COMMENT ON TABLE bank.command           IS 'Ordered player commands: the replay source. Not a FIBO concept.';
COMMENT ON TABLE bank.event             IS 'FIBO FND occurrences; UOP Event.';
COMMENT ON TABLE bank.gl_account        IS 'Chart of accounts. FIBO FND accounting (partial).';
COMMENT ON TABLE bank.journal_entry     IS 'Double-entry journal header. FIBO FND accounting (partial).';
COMMENT ON TABLE bank.journal_line      IS 'Journal line; entries sum to zero (enforced by a deferred constraint trigger). FIBO FND accounting (partial).';
COMMENT ON TABLE bank.decision          IS 'Who decided what, the options shown and the hidden true outcome. UOP Event.';
COMMENT ON TABLE bank.position_snapshot IS 'Month-end state of each account. FIBO LOAN status; FND accounting.';
COMMENT ON TABLE bank.regulatory_snapshot IS 'Capital ratio, liquidity and standing per month. No FIBO coverage; returns-style layout.';
COMMENT ON COLUMN bank.game.player_key  IS 'Opaque key; the only link to the account schema.';
COMMENT ON COLUMN bank.game.synthetic   IS 'Always true: every party and agreement in a game is invented.';
COMMENT ON COLUMN bank.journal_line.amount_pence IS 'Debit positive, credit negative.';
