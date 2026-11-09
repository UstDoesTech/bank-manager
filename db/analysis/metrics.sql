-- Example analysis queries over the metric views. Run them on the read replica as the bank_analysis role. Only games that allow
-- analysis, are synthetic and are not the training day appear, and nothing here can name a person.

-- 1. How close did each bank come to the edge? The lowest capital ratio, the shortest survival horizon and the worst arrears of each game.
SELECT game_id,
       min(capital_ratio)::numeric(6,4)   AS lowest_capital_ratio,
       min(survival_horizon_days)         AS shortest_survival_horizon_days,
       max(arrears_30_plus)::numeric(6,4) AS worst_arrears_rate
FROM bank.metric_month
GROUP BY game_id
ORDER BY lowest_capital_ratio;

-- 2. Which banks beat their peers, and by how much? Return on capital minus the benchmark for the year's economy, by rating.
SELECT letter, count(*) AS years, avg(return_vs_peers)::numeric(6,4) AS mean_return_vs_peers
FROM bank.metric_year
GROUP BY letter
ORDER BY mean_return_vs_peers DESC;

-- 3. Who judges best? Decision accuracy by case type for each decision maker.
SELECT case_type, decided_by, decisions, accuracy::numeric(5,3)
FROM bank.metric_decision_accuracy
ORDER BY case_type, accuracy DESC;

-- 4. The trade-off in alert thresholds: detection and false alarms for fraud, as the player set them.
SELECT round(avg(detection_rate)::numeric, 2) AS mean_detection, round(avg(false_alarm_rate)::numeric, 2) AS mean_false_alarms, count(*) AS months
FROM bank.metric_alerts_month
WHERE kind = 'fraud';

-- 5. Does lean staffing show up as a backlog? Mean utilisation and the age of the oldest case, by team.
SELECT team, avg(utilisation)::numeric(5,2) AS mean_utilisation, avg(oldest_case_age_months)::numeric(5,2) AS mean_oldest_case_age_months
FROM bank.metric_team_month
GROUP BY team
ORDER BY mean_oldest_case_age_months DESC;

-- 6. Does hedging protect the margin when rates move? Net interest margin and rate sensitivity by how much of the mortgage book is hedged.
SELECT CASE WHEN r.hedge_ratio = 0 THEN 'none' WHEN r.hedge_ratio <= 1 THEN 'up to fully' ELSE 'over-hedged' END AS hedging,
       count(*) AS bank_months, avg(m.net_interest_margin)::numeric(6,4) AS mean_margin, avg(m.rate_sensitivity_pence) / 100000.0 AS mean_rate_sensitivity_gbp_k
FROM bank.metric_month m JOIN bank.risk_month r USING (game_id, year, month)
GROUP BY 1
ORDER BY 1;

-- 7. Which products pay in which economy? Mean monthly margin by product and by the economy that year.
SELECT p.product, s.path AS economy, count(*) AS product_months, (avg(p.margin_pence) / 100000.0)::numeric(8,2) AS mean_margin_gbp_k
FROM bank.metric_product_month p JOIN bank.market_state s USING (game_id, year, month)
GROUP BY p.product, s.path
ORDER BY p.product, s.path;

-- 8. Sales pressure and its price: complaints per 1,000 sales against how hard the bonus scheme pushed.
SELECT round(avg(sales_index)::numeric, 2) AS mean_sales_index, round(avg(complaints_per_1000_sales)::numeric, 2) AS mean_complaints_per_1000_sales, count(*) AS bank_months
FROM bank.metric_conduct_month
GROUP BY width_bucket(sales_index::float8, 0.8, 1.6, 4)
ORDER BY 1;

-- 9. What did the player change before things went wrong? Settings changed in the three months before a game ended in failure.
SELECT ps.area, ps.setting, count(*) AS changes
FROM bank.policy_setting ps
JOIN bank.year_result yr ON yr.game_id = ps.game_id AND yr.status <> 'done'
JOIN bank.v_game g ON g.game_id = ps.game_id
WHERE (yr.year * 12 + 11) - (ps.year * 12 + ps.month) BETWEEN 0 AND 14
GROUP BY ps.area, ps.setting
ORDER BY changes DESC
LIMIT 20;

-- 10. How did players perform against each target? The share who met each long-term ambition, how far the rest got, and how long it took,
-- by level of difficulty.
SELECT ambition_name, difficulty, games, met_rate, mean_progress, median_progress, mean_shortfall_unmet, mean_years_to_meet
FROM bank.metric_ambition
ORDER BY difficulty, met_rate DESC;

-- 11. Who got furthest, year by year? Progress towards each target at the end of each year, with the year's rating.
SELECT year, letter, ambition_name, round(avg(progress), 3) AS mean_progress, count(*) FILTER (WHERE met_this_year) AS met_this_year
FROM bank.metric_ambition_year
GROUP BY year, letter, ambition_name
ORDER BY year, letter, mean_progress DESC;
