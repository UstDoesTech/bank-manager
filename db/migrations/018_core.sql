-- The tables as a simplified core banking system. Things that lived only in the game state are persisted here:
--   the options a game was started with, the products the bank sells and what it charges for them, every setting in force
--   (versioned, so any month's terms can be read back), and who controls each area of policy;
--   a ledger for each loan: every posting that moves a loan, its interest and its fees carries the loan's number, so a loan's
--   balance is the sum of its postings and the loan book reconciles to the general ledger;
--   one customer file: a borrower links to the person and the regular customer, and each customer has a KYC status.
-- Aligned to FIBO FBC (products and accounts) and FND (agreements), and UOP Agreement, Party Role and Event.

-- --- the game's options ------------------------------------------------------------------------------------------------
ALTER TABLE bank.game
  ADD COLUMN weekly          boolean NOT NULL DEFAULT false,
  ADD COLUMN characters      boolean NOT NULL DEFAULT false,
  ADD COLUMN households      boolean NOT NULL DEFAULT false,
  ADD COLUMN meetings        boolean NOT NULL DEFAULT false,
  ADD COLUMN rivals          boolean NOT NULL DEFAULT false,
  ADD COLUMN chief_executive boolean NOT NULL DEFAULT false;
UPDATE bank.game g SET
    weekly          = coalesce((c.payload -> 'opts' ->> 'weeks')::boolean, false) AND NOT g.tutorial AND g.scenario IS NULL,
    characters      = coalesce((c.payload -> 'opts' ->> 'characters')::boolean, false),
    households      = coalesce((c.payload -> 'opts' ->> 'households')::boolean, false) AND NOT g.tutorial AND g.scenario IS NULL,
    meetings        = coalesce((c.payload -> 'opts' ->> 'meetings')::boolean, false) AND NOT g.tutorial AND g.scenario IS NULL,
    rivals          = coalesce((c.payload -> 'opts' ->> 'rivals')::boolean, false) AND NOT g.tutorial AND g.scenario IS NULL,
    chief_executive = coalesce((c.payload -> 'opts' ->> 'chiefExecutive')::boolean, false) AND NOT g.tutorial AND g.scenario IS NULL
  FROM bank.command c WHERE c.game_id = g.id AND c.seq = 1;

-- --- products: what the bank sells, shared by every game, like the chart of accounts ------------------------------------
CREATE TABLE bank.product_catalogue (
  product        text PRIMARY KEY,
  product_name   text NOT NULL,
  family         text NOT NULL CHECK (family IN ('loan', 'deposit')),
  ledger_account text NOT NULL REFERENCES bank.gl_account(code),     -- where its balances sit in the general ledger
  pricing        text NOT NULL,                                       -- how its rate is set
  description    text NOT NULL
);
INSERT INTO bank.product_catalogue (product, product_name, family, ledger_account, pricing, description) VALUES
  ('mortgage',        'Residential mortgage',          'loan',    'loans',    'Bank Rate plus the mortgage spread, plus a loading by loan to value', 'Fixed for 2 or 5 years over 25 to 35 years, secured on the home.'),
  ('personal',        'Personal loan',                 'loan',    'loans',    'A standard rate, or a higher rate for riskier borrowers',             'Unsecured, 3 to 5 years.'),
  ('card',            'Credit card',                   'loan',    'loans',    'One APR',                                                              'A revolving limit.'),
  ('business',        'Business loan',                 'loan',    'loans',    'Bank Rate plus 4.4 points, plus a loading by sector',                 'Five years, optionally with a personal guarantee or a government guarantee.'),
  ('current_account', 'Current account',               'deposit', 'deposits', 'No interest',                                                          'For salary and spending.'),
  ('easy_access',     'Easy-access saver',             'deposit', 'deposits', 'The savings rate',                                                     'The retail deposit pool.'),
  ('large_deposit',   'Large deposit',                 'deposit', 'deposits', 'Agreed with each depositor',                                           'Councils, charities and firms; can leave in one decision.'),
  ('fixed_bond',      'Fixed-term bond',               'deposit', 'bonds',    'Fixed for the term',                                                   'One to three years; cannot be withdrawn early.');
COMMENT ON TABLE bank.product_catalogue IS 'FIBO FBC/ProductsAndServices FinancialProduct; UOP Product. What the bank sells, shared by every game.';

-- --- every setting in force, versioned ----------------------------------------------------------------------------------
-- One row per setting per period it held: from the command that set it to the command that replaced it (open while in force).
-- area: pricing, credit, treasury, funding, capital, operations, growth (the policy areas); deposits (the savings rate); branch
-- (upgrades and product decisions); control (who runs each policy area: locked, system or player).
CREATE TABLE bank.setting_version (
  game_id    uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  area       text NOT NULL,
  setting    text NOT NULL,                     -- for a banded setting, the band: 'ltvAdd>90'
  from_seq   integer NOT NULL,                  -- the command that put it in force
  from_year  integer NOT NULL,
  from_month integer NOT NULL,
  to_seq     integer,                           -- the command that replaced it; null while in force
  value      numeric,
  value_text text,
  owner      text NOT NULL CHECK (owner IN ('system', 'player', 'bank')),
  PRIMARY KEY (game_id, area, setting, from_seq)
);
CREATE UNIQUE INDEX setting_version_open ON bank.setting_version (game_id, area, setting) WHERE to_seq IS NULL;
COMMENT ON TABLE bank.setting_version IS 'FIBO FND/Agreements terms; UOP Agreement (terms over time). Every setting in force in a game, versioned by the commands that set it.';

CREATE VIEW bank.v_setting_current AS
  SELECT game_id, area, setting, value, value_text, owner, from_year, from_month, from_seq FROM bank.setting_version WHERE to_seq IS NULL;

-- What each product costs now: the current settings over the latest Bank Rate the game recorded.
CREATE VIEW bank.v_price_list AS
  WITH s AS (SELECT game_id, max(value) FILTER (WHERE area = 'pricing' AND setting = 'mortgageSpread') AS spread,
                    max(value) FILTER (WHERE area = 'pricing' AND setting = 'mortgagePremium') AS premium,
                    max(value) FILTER (WHERE area = 'pricing' AND setting = 'ltvAdd>75') AS add75,
                    max(value) FILTER (WHERE area = 'pricing' AND setting = 'ltvAdd>85') AS add85,
                    max(value) FILTER (WHERE area = 'pricing' AND setting = 'ltvAdd>90') AS add90,
                    max(value) FILTER (WHERE area = 'pricing' AND setting = 'personalLow') AS personal_low,
                    max(value) FILTER (WHERE area = 'pricing' AND setting = 'personalHigh') AS personal_high,
                    max(value) FILTER (WHERE area = 'pricing' AND setting = 'cardRate') AS card,
                    max(value) FILTER (WHERE area = 'deposits' AND setting = 'savingsRate') AS saver
             FROM bank.v_setting_current GROUP BY game_id),
       m AS (SELECT DISTINCT ON (game_id) game_id, base_rate FROM bank.market_state ORDER BY game_id, year DESC, month DESC)
  SELECT s.game_id, p.product, p.product_name, t.tier, t.rate_pct::numeric(6, 3) AS rate_pct
  FROM s LEFT JOIN m ON m.game_id = s.game_id
  CROSS JOIN LATERAL (VALUES
    ('mortgage', 'Up to 75% of the price',  coalesce(m.base_rate, 4) + s.spread),
    ('mortgage', '75% to 85%',              coalesce(m.base_rate, 4) + s.spread + s.add75),
    ('mortgage', '85% to 90%',              coalesce(m.base_rate, 4) + s.spread + s.add85),
    ('mortgage', 'Over 90%',                coalesce(m.base_rate, 4) + s.spread + s.add90),
    ('mortgage', 'Higher-risk loading',     s.premium),
    ('personal', 'Standard',                s.personal_low),
    ('personal', 'Higher rate',             s.personal_high),
    ('card',     'APR',                     s.card),
    ('easy_access', 'Savings rate',         s.saver)) AS t(product, tier, rate_pct)
  JOIN bank.product_catalogue p ON p.product = t.product;

-- --- a ledger for each loan ---------------------------------------------------------------------------------------------
ALTER TABLE bank.journal_line ADD COLUMN subledger text CHECK (subledger IN ('loan'));
ALTER TABLE bank.journal_line ADD COLUMN subledger_id integer;
COMMENT ON COLUMN bank.journal_line.subledger IS 'The account a line belongs to below the general ledger: loan, with subledger_id the agreement.';
CREATE INDEX journal_line_subledger ON bank.journal_line (game_id, subledger, subledger_id) WHERE subledger IS NOT NULL;

-- Each loan's statement: every posting that moved it, with what kind of transaction it was. Amounts are from the loan's side:
-- principal is the change in what is owed, interest and fees are what the borrower paid.
CREATE VIEW bank.v_loan_statement AS
  SELECT l.game_id, l.subledger_id AS agreement_id, e.seq AS entry_seq, e.command_seq, e.year, e.month,
    CASE e.memo WHEN 'loan.originate' THEN 'drawdown' WHEN 'loan.repay' THEN 'repayment' WHEN 'pl.intLoans' THEN 'interest'
                WHEN 'pl.fees' THEN 'fee' WHEN 'loan.writeoff' THEN 'write-off' WHEN 'loan.sell' THEN 'sold' WHEN 'pool.sale' THEN 'sold' ELSE e.memo END AS transaction_type,
    sum(l.amount_pence) FILTER (WHERE l.account = 'loans') AS principal_pence,
    -sum(l.amount_pence) FILTER (WHERE l.account IN ('pl.intLoans', 'pl.fees')) AS charged_pence,
    sum(l.amount_pence) FILTER (WHERE l.account = 'pl.losses') AS loss_pence
  FROM bank.journal_line l JOIN bank.journal_entry e ON e.game_id = l.game_id AND e.seq = l.entry_seq
  WHERE l.subledger = 'loan'
  GROUP BY l.game_id, l.subledger_id, e.seq, e.command_seq, e.year, e.month, e.memo;

-- Each loan's balance from its postings, against the balance the agreement records.
CREATE VIEW bank.v_loan_ledger AS
  SELECT a.game_id, a.agreement_id, a.product, a.status, a.balance_pence AS agreement_balance_pence,
    coalesce(sum(s.principal_pence), 0) AS posted_balance_pence,
    coalesce(sum(s.charged_pence) FILTER (WHERE s.transaction_type = 'interest'), 0) AS interest_paid_pence,
    coalesce(sum(s.charged_pence) FILTER (WHERE s.transaction_type = 'fee'), 0) AS fees_paid_pence,
    coalesce(sum(s.loss_pence), 0) AS loss_pence,
    count(s.entry_seq)::int AS postings
  FROM bank.agreement a LEFT JOIN bank.v_loan_statement s ON s.game_id = a.game_id AND s.agreement_id = a.agreement_id
  GROUP BY a.game_id, a.agreement_id, a.product, a.status, a.balance_pence;

-- The loan book against the general ledger: the control account, what the loans' own postings add up to, and anything posted
-- to the control account without a loan (none, for games recorded after this migration).
CREATE VIEW bank.v_loan_reconciliation AS
  SELECT game_id, sum(amount_pence) AS control_pence,
    coalesce(sum(amount_pence) FILTER (WHERE subledger = 'loan'), 0) AS loans_pence,
    coalesce(sum(amount_pence) FILTER (WHERE subledger IS NULL), 0) AS unattributed_pence
  FROM bank.journal_line WHERE account = 'loans' GROUP BY game_id;

-- --- one customer file ------------------------------------------------------------------------------------------------
ALTER TABLE bank.party ADD COLUMN person_id bigint REFERENCES bank.person(person_id);
ALTER TABLE bank.party ADD COLUMN customer_id integer;
COMMENT ON COLUMN bank.party.person_id IS 'The person behind a borrower: the borrower, or the director of a business.';
COMMENT ON COLUMN bank.party.customer_id IS 'The regular customer behind a borrower, when there is one.';
ALTER TABLE bank.customer ADD COLUMN kyc_status text NOT NULL DEFAULT 'on_file' CHECK (kyc_status IN ('verified', 'verified_with_documents', 'on_file'));
COMMENT ON COLUMN bank.customer.kyc_status IS 'verified at the counter; verified after asking for documents; on_file for customers who banked here before the player arrived.';

-- Everything the bank holds for a regular customer: their loans, from the agreements.
CREATE VIEW bank.v_customer_holding AS
  SELECT c.game_id, c.customer_id, pe.full_name, c.kyc_status, a.agreement_id, a.product, a.status, a.balance_pence, a.rate_pct
  FROM bank.customer c JOIN bank.person pe ON pe.person_id = c.person_id
  JOIN bank.party p ON p.game_id = c.game_id AND p.customer_id = c.customer_id
  JOIN bank.agreement a ON a.game_id = p.game_id AND a.party_id = p.party_id;
