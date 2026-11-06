-- Financial literacy check: five questions before a player's first recorded game and again after each year of play.
-- Keyed by the opaque player key, never by an email or name, and removed with the player.
CREATE TABLE bank.literacy_check (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_key   uuid NOT NULL,
  attempt      integer NOT NULL,                       -- 1 is before the first game; the rest follow each year played
  phase        text NOT NULL CHECK (phase IN ('before', 'after')),
  years_played integer NOT NULL,                       -- completed years at the time (0 for 'before')
  game_id      uuid REFERENCES bank.game(id) ON DELETE SET NULL,
  taken_at     timestamptz NOT NULL DEFAULT now(),
  answers      jsonb NOT NULL,                         -- question id to the option chosen ('dk' is don't know)
  correct      jsonb NOT NULL,                         -- question id to true or false
  score        smallint NOT NULL CHECK (score BETWEEN 0 AND 5),
  in_analysis  boolean NOT NULL DEFAULT true,
  UNIQUE (player_key, attempt)
);
CREATE INDEX literacy_player ON bank.literacy_check (player_key, attempt);

-- Analysis views (the read replica queries these). Only players who allow analysis appear.
CREATE VIEW bank.literacy_progress AS
  SELECT f.player_key, f.score AS first_score, l.score AS latest_score, l.score - f.score AS change,
         l.attempt - 1 AS checks_after, l.years_played
  FROM bank.literacy_check f
  JOIN LATERAL (SELECT * FROM bank.literacy_check x WHERE x.player_key = f.player_key AND x.in_analysis ORDER BY attempt DESC LIMIT 1) l ON true
  WHERE f.attempt = 1 AND f.in_analysis AND l.attempt > 1;

CREATE VIEW bank.literacy_by_concept AS
  SELECT c.phase, c.years_played, q.key AS question,
         count(*) AS answers, avg((q.value)::text::boolean::int)::numeric(4, 3) AS share_correct
  FROM bank.literacy_check c, LATERAL jsonb_each(c.correct) q
  WHERE c.in_analysis
  GROUP BY c.phase, c.years_played, q.key;

-- How play relates to learning: for each player, the share of their decisions where the option chosen was the
-- better one is not known to the database (the hidden truth is kept), so this view joins the check with the amount of
-- play: decisions made, years played, and whether the first game ended in failure.
CREATE VIEW bank.literacy_with_play AS
  SELECT c.player_key, c.attempt, c.score, c.years_played,
         (SELECT count(*) FROM bank.decision d JOIN bank.game g ON g.id = d.game_id WHERE g.player_key = c.player_key AND g.in_analysis) AS decisions,
         (SELECT count(*) FROM bank.game g WHERE g.player_key = c.player_key AND g.in_analysis AND g.status = 'failed') AS failed_games
  FROM bank.literacy_check c WHERE c.in_analysis;

COMMENT ON TABLE bank.literacy_check IS 'Five-question financial literacy check (after Lusardi and Mitchell''s Big Five). No FIBO coverage.';
