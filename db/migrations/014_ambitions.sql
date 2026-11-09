-- Long-term ambitions: how each player stood against each target as every year ended. The engine decides the ambitions and their
-- targets; the server writes one row per ambition per finished year, with the target as it was at the time, so a later change to
-- a target never rewrites what a player was set. Analysis reads it only through the views below.
CREATE TABLE bank.ambition_result (
  game_id       uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  year          integer NOT NULL,
  ambition      text NOT NULL,                  -- the engine's key, for example 'trust' or 'steady'
  ambition_name text NOT NULL,
  unit          text NOT NULL,                  -- gbp_thousands, years, score, cases or branches
  value         numeric(16, 3) NOT NULL,        -- where the player stood at the end of the year
  target        numeric(16, 3) NOT NULL,
  progress      numeric(6, 4) NOT NULL CHECK (progress BETWEEN 0 AND 1),   -- 1 once met, otherwise value over target
  met           boolean NOT NULL,               -- met in this year or an earlier one
  met_year      integer,                        -- the year it was first met
  PRIMARY KEY (game_id, year, ambition)
);
COMMENT ON TABLE bank.ambition_result IS 'Game metadata: how a player stood against each long-term ambition at the end of each year, with the target then.';

-- One row per game, year and ambition, for games the analysis may see (opted in, synthetic, not the training day).
CREATE VIEW bank.metric_ambition_year AS
  SELECT a.game_id, a.year, a.ambition, a.ambition_name, a.unit, a.value, a.target, a.progress, a.met, a.met_year,
    (a.met_year = a.year) AS met_this_year, greatest(a.target - a.value, 0)::numeric(16, 3) AS shortfall, g.difficulty, y.letter
  FROM bank.ambition_result a
  JOIN bank.v_game g ON g.game_id = a.game_id
  LEFT JOIN bank.year_result y ON y.game_id = a.game_id AND y.year = a.year;

-- How players did against each target, by level: the share who met it, how far the rest got, and how long it took.
CREATE VIEW bank.metric_ambition AS
  WITH latest AS (SELECT DISTINCT ON (game_id, ambition) * FROM bank.metric_ambition_year ORDER BY game_id, ambition, year DESC),
       first_year AS (SELECT game_id, min(year) AS y0 FROM bank.ambition_result GROUP BY game_id)
  SELECT l.ambition, l.ambition_name, l.unit, l.difficulty,
    count(*)::int                                                                    AS games,
    (count(*) FILTER (WHERE l.met))::int                                             AS games_met,
    avg(l.met::int)::numeric(6, 4)                                                   AS met_rate,
    avg(l.progress)::numeric(6, 4)                                                   AS mean_progress,
    (percentile_cont(0.5) WITHIN GROUP (ORDER BY l.progress))::numeric(6, 4)         AS median_progress,
    avg(l.target)::numeric(16, 3)                                                    AS target,
    (avg(l.shortfall) FILTER (WHERE NOT l.met))::numeric(16, 3)                      AS mean_shortfall_unmet,
    (avg(l.met_year - f.y0 + 1) FILTER (WHERE l.met))::numeric(6, 2)                 AS mean_years_to_meet
  FROM latest l JOIN first_year f ON f.game_id = l.game_id
  GROUP BY l.ambition, l.ambition_name, l.unit, l.difficulty;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bank_analysis') THEN
    EXECUTE 'GRANT SELECT ON bank.metric_ambition_year, bank.metric_ambition TO bank_analysis';
  END IF;
END $$;
