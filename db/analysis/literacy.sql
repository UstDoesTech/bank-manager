-- Example analysis queries for the literacy check. Run them on the read replica. Only players who allow analysis appear
-- in these views, and nothing here can name a person: rows carry an opaque key.

-- 1. Did scores change? One row per player who has taken the check before and after at least once.
SELECT count(*) AS players,
       avg(first_score)::numeric(3,2)  AS mean_before,
       avg(latest_score)::numeric(3,2) AS mean_latest,
       avg(change)::numeric(3,2)       AS mean_change
FROM bank.literacy_progress;

-- 2. By concept: the share answering each question correctly before play and after each year of play.
SELECT question, phase, years_played, answers, share_correct
FROM bank.literacy_by_concept
ORDER BY question, years_played;

-- 3. By how far the player got: change in score against years played.
SELECT years_played, count(*) AS players, avg(change)::numeric(3,2) AS mean_change
FROM bank.literacy_progress
GROUP BY years_played ORDER BY years_played;

-- 4. Learning against play: score at each check beside the number of decisions made and failed games.
SELECT attempt, avg(score)::numeric(3,2) AS mean_score, avg(decisions)::numeric(6,1) AS mean_decisions, avg(failed_games)::numeric(3,2) AS mean_failed_games
FROM bank.literacy_with_play
GROUP BY attempt ORDER BY attempt;

-- 5. Which concepts improve most? Compare each question before and at one year.
SELECT b.question,
       b.share_correct AS before,
       a.share_correct AS after_one_year,
       (a.share_correct - b.share_correct)::numeric(4,3) AS gain
FROM bank.literacy_by_concept b
JOIN bank.literacy_by_concept a ON a.question = b.question AND a.phase = 'after' AND a.years_played = 1
WHERE b.phase = 'before'
ORDER BY gain DESC;
