-- Depth: expected credit losses, the counter clock, the branch team's standing instructions and the weekly challenge.
--
-- Expected credit losses. With the risk option a game sets money aside for loans that may go bad when it lends, and trues
-- the amount up each month (IFRS 9 style). The allowance is a contra-asset: it sits on the asset side with a credit balance,
-- and the bank's assets in v_position are net of it.
INSERT INTO bank.gl_account (code, name, type, normal_side) VALUES
  ('provision', 'Allowance for expected credit losses', 'asset', 'credit')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE bank.game ADD COLUMN depth boolean NOT NULL DEFAULT false;
ALTER TABLE bank.game ADD COLUMN challenge text CHECK (challenge ~ '^\d{4}-W\d{2}$');
COMMENT ON COLUMN bank.game.depth IS 'Played with the depth option: expected credit losses, the counter clock, ID photos, standing instructions, town stories, arranged overdrafts and the month-end review of calls.';
COMMENT ON COLUMN bank.game.challenge IS 'The ISO week of the weekly challenge this game was started for (same seed and options for everyone that week); null otherwise.';
CREATE INDEX game_challenge ON bank.game (challenge) WHERE challenge IS NOT NULL;

-- Decisions made without a command of their own: a case the branch team decided by the player's standing instructions
-- (decided_by 'staff'), and a customer who gave up waiting when the counter ran out of time (decided_by 'clock', chosen
-- 'walked'). Several can come from one command, so a decision is now keyed by its card as well.
ALTER TABLE bank.decision DROP CONSTRAINT decision_pkey;
ALTER TABLE bank.decision ADD PRIMARY KEY (game_id, command_seq, card_id);
ALTER TABLE bank.decision ADD CONSTRAINT decision_decided_by CHECK (decided_by IN ('player', 'staff', 'clock'));
COMMENT ON COLUMN bank.decision.decided_by IS 'player: the player''s own decision; staff: the branch team, by the player''s standing instructions; clock: the customer walked out before being seen.';

CREATE OR REPLACE VIEW bank.v_position AS            -- balances at the end of each month; goodwill is deducted from capital in full
  SELECT p.game_id, p.year, p.month,
    coalesce(sum(p.balance_pence) FILTER (WHERE p.account IN ('cash', 'gilts', 'legacy', 'loans', 'retained', 'collateral', 'provision')), 0)::bigint AS assets_pence,
    coalesce(sum(p.balance_pence) FILTER (WHERE p.account IN ('legacy', 'loans')), 0)::bigint AS loans_pence,
    coalesce(-sum(p.balance_pence) FILTER (WHERE p.account = 'deposits'), 0)::bigint AS deposits_pence,
    coalesce(sum(p.balance_pence) FILTER (WHERE p.account = 'goodwill'), 0)::bigint AS goodwill_pence,
    coalesce(-sum(p.balance_pence) FILTER (WHERE p.account LIKE 'equity.%' OR p.account LIKE 'pl.%'), 0)::bigint AS book_equity_pence,
    coalesce(-sum(p.balance_pence) FILTER (WHERE p.account = 'provision'), 0)::bigint AS provision_pence
  FROM bank.position_snapshot p
  JOIN bank.v_game g ON g.game_id = p.game_id
  GROUP BY p.game_id, p.year, p.month;

CREATE OR REPLACE VIEW bank.v_decision_truth AS      -- was each decision consistent with what the engine knew was true?
  SELECT d.game_id, d.command_seq, d.kind, d.year, d.month, d.decided_by, d.chosen,
    CASE WHEN d.decided_by = 'clock' THEN NULL ELSE CASE d.kind
      WHEN 'fraud'     THEN (d.chosen = 'block') = coalesce((d.truth ->> 'fraud')::boolean, false)
      WHEN 'sanctions' THEN (d.chosen IN ('hold', 'freeze')) = coalesce((d.truth ->> 'real')::boolean, false)
      WHEN 'aml'       THEN (d.chosen IN ('sar', 'exit')) = coalesce((d.truth ->> 'guilty')::boolean, false)
      WHEN 'onboard'   THEN (d.chosen = 'no') = coalesce((d.truth ->> 'bad')::boolean, false)
      WHEN 'personal'  THEN (d.chosen <> 'no') = ((d.truth ->> 'pd')::numeric < 0.08)
      WHEN 'business'  THEN (d.chosen <> 'no') = ((d.truth ->> 'pd')::numeric < 0.08)
      WHEN 'visit'     THEN d.chosen = (d.truth ->> 'best')
      WHEN 'app'       THEN (d.chosen = 'stop') = coalesce((d.truth ->> 'scam')::boolean, false)
      WHEN 'complaint' THEN (d.chosen <> 'reject') = coalesce((d.truth ->> 'valid')::boolean, false)
    END END AS consistent,
    (d.truth ->> 'fraud')::boolean AS is_fraud,
    d.card_id
  FROM bank.decision d JOIN bank.v_game g ON g.game_id = d.game_id;

CREATE OR REPLACE VIEW bank."case" AS                -- alerts that needed a decision, with whether the alert was true
  SELECT d.game_id, d.command_seq AS case_id, d.kind AS case_type, d.year, d.month, d.chosen AS outcome,
    CASE d.kind WHEN 'fraud' THEN coalesce((d.truth ->> 'fraud')::boolean, false)
                WHEN 'aml' THEN coalesce((d.truth ->> 'guilty')::boolean, false)
                WHEN 'sanctions' THEN coalesce((d.truth ->> 'real')::boolean, false) END AS alert_was_true,
    d.card_id, d.decided_by
  FROM bank.decision d JOIN bank.v_game g ON g.game_id = d.game_id
  WHERE d.kind IN ('fraud', 'aml', 'sanctions');
COMMENT ON VIEW bank."case" IS 'UOP Claim and Event. Alerts that needed a decision, and whether each was true. A case is identified by (game_id, case_id, card_id): the branch team can decide several in one command.';
