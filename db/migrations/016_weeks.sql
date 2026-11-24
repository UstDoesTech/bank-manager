-- Weekly turns and everyday visits. A weekly game records the week of the month each decision was made in (0 to 3; null in a
-- game played a month at a time), and the analysis judges an everyday visit against the answer the engine knew was best.
ALTER TABLE bank.decision ADD COLUMN week smallint CHECK (week BETWEEN 0 AND 3);
COMMENT ON COLUMN bank.decision.week IS 'Week of the month, 0 to 3, in a game played in weeks; null when the game is played a month at a time.';

CREATE OR REPLACE VIEW bank.v_decision_truth AS      -- was each decision consistent with what the engine knew was true?
  SELECT d.game_id, d.command_seq, d.kind, d.year, d.month, d.decided_by, d.chosen,
    CASE d.kind
      WHEN 'fraud'     THEN (d.chosen = 'block') = coalesce((d.truth ->> 'fraud')::boolean, false)
      WHEN 'sanctions' THEN (d.chosen IN ('hold', 'freeze')) = coalesce((d.truth ->> 'real')::boolean, false)
      WHEN 'aml'       THEN (d.chosen IN ('sar', 'exit')) = coalesce((d.truth ->> 'guilty')::boolean, false)
      WHEN 'onboard'   THEN (d.chosen = 'no') = coalesce((d.truth ->> 'bad')::boolean, false)
      WHEN 'personal'  THEN (d.chosen <> 'no') = ((d.truth ->> 'pd')::numeric < 0.08)
      WHEN 'business'  THEN (d.chosen <> 'no') = ((d.truth ->> 'pd')::numeric < 0.08)
      WHEN 'visit'     THEN d.chosen = (d.truth ->> 'best')
    END AS consistent,
    (d.truth ->> 'fraud')::boolean AS is_fraud
  FROM bank.decision d JOIN bank.v_game g ON g.game_id = d.game_id;
