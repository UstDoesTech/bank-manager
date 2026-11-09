-- Rival banks. They are invented, appear only once the player has unlocked the pricing controls, and compete for savers and mortgage
-- customers. The engine decides what they do; the server writes what it reports each month. Analysis reads the views at the bottom.
CREATE TABLE bank.rival (
  game_id                uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  rival_key              text NOT NULL,
  rival_name             text NOT NULL,                 -- invented
  style                  text NOT NULL,
  introduced_year        integer NOT NULL,              -- the year the player unlocked pricing
  introduced_month       integer NOT NULL,
  opening_deposits_pence bigint NOT NULL,
  PRIMARY KEY (game_id, rival_key)
);
CREATE TABLE bank.rival_month (
  game_id        uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  rival_key      text NOT NULL,
  year           integer NOT NULL,
  month          integer NOT NULL,
  saver_rate     numeric(6, 3) NOT NULL,                -- what the rival paid savers, in percent
  mortgage_rate  numeric(6, 3) NOT NULL,                -- what it charged for a typical mortgage, in percent
  deposits_pence bigint NOT NULL,
  share          numeric(7, 5) NOT NULL,                -- its share of deposits held by the player and the rivals together
  PRIMARY KEY (game_id, rival_key, year, month),
  FOREIGN KEY (game_id, rival_key) REFERENCES bank.rival(game_id, rival_key)
);
CREATE TABLE bank.competitor_month (                     -- the player's own side of the comparison, month by month
  game_id             uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  year                integer NOT NULL,
  month               integer NOT NULL,
  our_saver_rate      numeric(6, 3) NOT NULL,
  our_mortgage_rate   numeric(6, 3) NOT NULL,
  our_deposits_pence  bigint NOT NULL,
  our_share           numeric(7, 5) NOT NULL,
  PRIMARY KEY (game_id, year, month)
);
COMMENT ON TABLE bank.rival IS 'FIBO FBC financial institutions; UOP Organization. The invented rival banks in a game and when they were introduced.';
COMMENT ON TABLE bank.rival_month IS 'FIBO FBC deposit products (rates) and loan pricing; UOP Measurement. What each rival paid savers and charged, and its size, each month.';
COMMENT ON TABLE bank.competitor_month IS 'Game metadata: the player''s own saver rate, mortgage rate and share of deposits each month, to set against the rivals.';

-- The player against the best and the cheapest rival, each month, for games the analysis may see.
CREATE VIEW bank.metric_rival_month AS
  WITH rv AS (
    SELECT game_id, year, month, max(saver_rate) AS best_saver_rate, min(mortgage_rate) AS cheapest_mortgage_rate,
           avg(saver_rate) AS mean_saver_rate, avg(mortgage_rate) AS mean_mortgage_rate, count(*)::int AS rivals
    FROM bank.rival_month GROUP BY game_id, year, month
  )
  SELECT c.game_id, c.year, c.month, g.difficulty, rv.rivals,
    c.our_saver_rate, rv.best_saver_rate, rv.mean_saver_rate, (c.our_saver_rate - rv.best_saver_rate)::numeric(6, 3) AS saver_gap,
    c.our_mortgage_rate, rv.cheapest_mortgage_rate, rv.mean_mortgage_rate, (c.our_mortgage_rate - rv.cheapest_mortgage_rate)::numeric(6, 3) AS mortgage_gap,
    c.our_share,
    c.our_deposits_pence::numeric / NULLIF(lag(c.our_deposits_pence) OVER (PARTITION BY c.game_id ORDER BY c.year, c.month), 0) - 1 AS deposit_growth
  FROM bank.competitor_month c
  JOIN bank.v_game g ON g.game_id = c.game_id
  JOIN rv ON rv.game_id = c.game_id AND rv.year = c.year AND rv.month = c.month;

-- Does paying savers more than the rivals pay? Deposit growth and market share in the months the player led and the months it trailed.
CREATE VIEW bank.metric_rival AS
  SELECT difficulty, (saver_gap >= 0) AS led_on_savers,
    count(DISTINCT game_id)::int AS games, count(*)::int AS months,
    avg(deposit_growth)::numeric(8, 5) AS mean_deposit_growth,
    avg(our_share)::numeric(7, 5) AS mean_share,
    avg(saver_gap)::numeric(6, 3) AS mean_saver_gap,
    avg(mortgage_gap)::numeric(6, 3) AS mean_mortgage_gap
  FROM bank.metric_rival_month
  GROUP BY difficulty, (saver_gap >= 0);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bank_analysis') THEN
    EXECUTE 'GRANT SELECT ON bank.metric_rival_month, bank.metric_rival TO bank_analysis';
  END IF;
END $$;
