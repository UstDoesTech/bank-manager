-- The analysis layer: the remaining data-model tables, the metric views the design defines once, and a read-only role.
-- Every view reads only games that allow analysis, are not the tutorial and are synthetic, so an opted-out player never appears.

-- ---------------------------------------------------------------------------------------------------------------------
-- Columns the views need
-- ---------------------------------------------------------------------------------------------------------------------
ALTER TABLE bank.decision ADD COLUMN shown jsonb NOT NULL DEFAULT '[]';           -- the papers on the desk when the decision was made
ALTER TABLE bank.incentive_month ADD COLUMN sales numeric(10, 1);                   -- sales that month, for complaints per 1,000 sales

-- ---------------------------------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------------------------------
CREATE TABLE bank.market_state (
  game_id           uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  year              integer NOT NULL,
  month             integer NOT NULL,
  base_rate         numeric(6, 3) NOT NULL,
  unemployment      numeric(6, 3) NOT NULL,
  house_price_index numeric(8, 4) NOT NULL,
  share_index       numeric(10, 3) NOT NULL,
  inflation         numeric(6, 3) NOT NULL,
  path              text NOT NULL,                                                 -- the economy this year: soft, sticky, downturn, recovery, scenario
  PRIMARY KEY (game_id, year, month)
);
CREATE TABLE bank.policy_setting (                                                  -- every change to a pricing, credit or other rule, and when it took effect
  game_id   uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  log_id    integer NOT NULL,
  year      integer NOT NULL,
  month     integer NOT NULL,
  area      text NOT NULL,
  setting   text NOT NULL,                                                         -- '*' when an area was handed back to the executive team
  value     numeric,
  owner     text NOT NULL CHECK (owner IN ('player', 'system')),
  PRIMARY KEY (game_id, log_id, setting)
);
CREATE TABLE bank.account (                                                         -- deposit balances: the retail pool, large depositors, bonds and the households' savings
  game_id       uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  account_id    text NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('easy_access', 'large_deposit', 'fixed_bond', 'household_savings')),
  balance_pence bigint NOT NULL,
  rate_pct      numeric(6, 3),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  PRIMARY KEY (game_id, account_id)
);
CREATE TABLE bank.party_role (
  game_id  uuid NOT NULL,
  party_id integer NOT NULL,
  role     text NOT NULL CHECK (role IN ('borrower', 'guarantor')),
  PRIMARY KEY (game_id, party_id, role),
  FOREIGN KEY (game_id, party_id) REFERENCES bank.party(game_id, party_id) ON DELETE CASCADE
);
CREATE TABLE bank.security_holding (                                                -- month-end gilts
  game_id        uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  year           integer NOT NULL,
  month          integer NOT NULL,
  holding        integer NOT NULL,
  kind           text NOT NULL,                                                    -- short or long
  nominal_pence  bigint NOT NULL,
  coupon_pct     numeric(6, 3) NOT NULL,
  duration_years numeric(6, 2) NOT NULL,
  market_pence   bigint NOT NULL,
  PRIMARY KEY (game_id, year, month, holding)
);
CREATE TABLE bank.risk_month (                                                      -- risk measures the ledger cannot give
  game_id                uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  year                   integer NOT NULL,
  month                  integer NOT NULL,
  rate_sensitivity_pence bigint NOT NULL,                                          -- change in a year's net interest income for a one-point rise in Bank Rate
  survival_horizon_days  integer NOT NULL,
  lcr                    numeric(10, 3) NOT NULL,
  wholesale_share        numeric(8, 5) NOT NULL,
  top10_depositor_share  numeric(8, 5) NOT NULL,
  loan_to_deposit        numeric(8, 5) NOT NULL,
  hedge_ratio            numeric(8, 5) NOT NULL,
  collateral_pence       bigint NOT NULL,
  change_meter           numeric(8, 3),                                            -- null until operations is taken over
  boe_pence              bigint NOT NULL,
  PRIMARY KEY (game_id, year, month)
);
CREATE TABLE bank.year_result (
  game_id           uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  year              integer NOT NULL,
  status            text NOT NULL,                                                 -- done, or why the game ended
  letter            text NOT NULL,
  score             numeric(6, 1) NOT NULL,
  profit_pence      bigint NOT NULL,
  return_on_capital numeric(8, 5) NOT NULL,
  peer_benchmark    numeric(8, 5) NOT NULL,                                        -- what similar banks earned in the same economy
  PRIMARY KEY (game_id, year)
);
CREATE TABLE bank.alert_month (                                                     -- fraud and money-laundering alerts as the operations model saw them
  game_id      uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  year         integer NOT NULL,
  month        integer NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('fraud', 'aml')),
  true_cases   numeric(8, 1),
  caught       numeric(8, 1),
  missed       numeric(8, 2) NOT NULL,
  false_alerts numeric(8, 1),
  unreviewed   numeric(8, 1),
  PRIMARY KEY (game_id, year, month, kind)
);
CREATE TABLE bank.product_month (
  game_id      uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  year         integer NOT NULL,
  month        integer NOT NULL,
  product      text NOT NULL,
  revenue_pence bigint NOT NULL,
  loss_pence   bigint NOT NULL,
  cost_pence   bigint NOT NULL,
  PRIMARY KEY (game_id, year, month, product)
);

-- ---------------------------------------------------------------------------------------------------------------------
-- Which games the views may see
-- ---------------------------------------------------------------------------------------------------------------------
CREATE VIEW bank.v_game AS
  SELECT id AS game_id FROM bank.game WHERE in_analysis AND synthetic AND NOT tutorial;

-- ---------------------------------------------------------------------------------------------------------------------
-- Building blocks: the month's profit and loss and the month-end position, from the ledger
-- ---------------------------------------------------------------------------------------------------------------------
CREATE VIEW bank.v_month_pl AS                       -- each figure is what it added to profit, so costs and losses are negative
  SELECT e.game_id, e.year, e.month,
    coalesce(-sum(l.amount_pence) FILTER (WHERE l.account IN ('pl.intLoans', 'pl.intGilts', 'pl.intRes', 'pl.intDep', 'pl.intCB')), 0)::bigint AS net_interest_pence,
    coalesce(-sum(l.amount_pence) FILTER (WHERE l.account IN ('pl.fees', 'pl.wealth')), 0)::bigint AS fees_pence,
    coalesce(-sum(l.amount_pence) FILTER (WHERE l.account = 'pl.losses'), 0)::bigint AS losses_pence,
    coalesce(-sum(l.amount_pence) FILTER (WHERE l.account = 'pl.costs'), 0)::bigint AS costs_pence,
    coalesce(-sum(l.amount_pence) FILTER (WHERE l.account = 'pl.redress'), 0)::bigint AS redress_pence,
    coalesce(-sum(l.amount_pence) FILTER (WHERE l.account IN ('pl.gilts', 'pl.swaps')), 0)::bigint AS trading_pence,
    coalesce(-sum(l.amount_pence) FILTER (WHERE l.account LIKE 'pl.%'), 0)::bigint AS profit_pence
  FROM bank.journal_entry e
  JOIN bank.journal_line l ON l.game_id = e.game_id AND l.entry_seq = e.seq
  JOIN bank.v_game g ON g.game_id = e.game_id
  GROUP BY e.game_id, e.year, e.month;

CREATE VIEW bank.v_position AS                       -- balances at the end of each month; goodwill is deducted from capital in full
  SELECT p.game_id, p.year, p.month,
    coalesce(sum(p.balance_pence) FILTER (WHERE p.account IN ('cash', 'gilts', 'legacy', 'loans', 'retained', 'collateral')), 0)::bigint AS assets_pence,
    coalesce(sum(p.balance_pence) FILTER (WHERE p.account IN ('legacy', 'loans')), 0)::bigint AS loans_pence,
    coalesce(-sum(p.balance_pence) FILTER (WHERE p.account = 'deposits'), 0)::bigint AS deposits_pence,
    coalesce(sum(p.balance_pence) FILTER (WHERE p.account = 'goodwill'), 0)::bigint AS goodwill_pence,
    coalesce(-sum(p.balance_pence) FILTER (WHERE p.account LIKE 'equity.%' OR p.account LIKE 'pl.%'), 0)::bigint AS book_equity_pence
  FROM bank.position_snapshot p
  JOIN bank.v_game g ON g.game_id = p.game_id
  GROUP BY p.game_id, p.year, p.month;

CREATE VIEW bank.v_arrears AS                        -- there is no 90+ day bucket: the game writes an account off after two months
  SELECT c.game_id, c.year, c.month,
    sum(c.balance_pence) AS balance_pence,
    sum(c.days_30_pence + c.days_60_pence + c.plan_pence) AS behind_pence,
    sum(c.days_60_pence) AS behind_60_pence
  FROM bank.portfolio_cohort c JOIN bank.v_game g ON g.game_id = c.game_id
  GROUP BY c.game_id, c.year, c.month;

CREATE VIEW bank.v_decision_truth AS                 -- was each decision consistent with what the engine knew was true?
  SELECT d.game_id, d.command_seq, d.kind, d.year, d.month, d.decided_by, d.chosen,
    CASE d.kind
      WHEN 'fraud'     THEN (d.chosen = 'block') = coalesce((d.truth ->> 'fraud')::boolean, false)
      WHEN 'sanctions' THEN (d.chosen IN ('hold', 'freeze')) = coalesce((d.truth ->> 'real')::boolean, false)
      WHEN 'aml'       THEN (d.chosen IN ('sar', 'exit')) = coalesce((d.truth ->> 'guilty')::boolean, false)
      WHEN 'onboard'   THEN (d.chosen = 'no') = coalesce((d.truth ->> 'bad')::boolean, false)
      WHEN 'personal'  THEN (d.chosen <> 'no') = ((d.truth ->> 'pd')::numeric < 0.08)
      WHEN 'business'  THEN (d.chosen <> 'no') = ((d.truth ->> 'pd')::numeric < 0.08)
    END AS consistent,
    (d.truth ->> 'fraud')::boolean AS is_fraud
  FROM bank.decision d JOIN bank.v_game g ON g.game_id = d.game_id;

-- ---------------------------------------------------------------------------------------------------------------------
-- Cases and documents, as the data model describes them
-- ---------------------------------------------------------------------------------------------------------------------
CREATE VIEW bank."case" AS                           -- alerts that needed a decision, with whether the alert was true
  SELECT d.game_id, d.command_seq AS case_id, d.kind AS case_type, d.year, d.month, d.chosen AS outcome,
    CASE d.kind WHEN 'fraud' THEN coalesce((d.truth ->> 'fraud')::boolean, false)
                WHEN 'aml' THEN coalesce((d.truth ->> 'guilty')::boolean, false)
                WHEN 'sanctions' THEN coalesce((d.truth ->> 'real')::boolean, false) END AS alert_was_true
  FROM bank.decision d JOIN bank.v_game g ON g.game_id = d.game_id
  WHERE d.kind IN ('fraud', 'aml', 'sanctions');

CREATE VIEW bank.document AS                         -- the papers shown on the desk for each decision
  SELECT d.game_id, d.command_seq AS case_id, d.kind AS case_type, f.value ->> 'l' AS field, f.value ->> 'v' AS shown_value
  FROM bank.decision d JOIN bank.v_game g ON g.game_id = d.game_id, jsonb_array_elements(d.shown) AS f(value);

-- ---------------------------------------------------------------------------------------------------------------------
-- The metrics, defined once. See db/semantic/bank_metrics.yaml for each definition, unit and grain.
-- ---------------------------------------------------------------------------------------------------------------------
CREATE VIEW bank.metric_month AS                     -- bank by month
  WITH pos AS (
    SELECT v.*, lag(v.assets_pence) OVER w AS prev_assets_pence, lag(v.loans_pence) OVER w AS prev_loans_pence
    FROM bank.v_position v WINDOW w AS (PARTITION BY v.game_id ORDER BY v.year, v.month)
  )
  SELECT r.game_id, r.year, r.month,
    pl.profit_pence,
    pl.net_interest_pence * 12.0 / NULLIF((pos.assets_pence + coalesce(pos.prev_assets_pence, pos.assets_pence)) / 2.0, 0)       AS net_interest_margin,
    -pl.costs_pence::numeric / NULLIF(pl.net_interest_pence + pl.fees_pence, 0)                                                    AS cost_income,
    -pl.losses_pence * 12.0 / NULLIF((pos.loans_pence + coalesce(pos.prev_loans_pence, pos.loans_pence)) / 2.0, 0)                AS cost_of_risk,
    r.capital_ratio, r.liquidity_ratio,
    pos.loans_pence::numeric / NULLIF(pos.deposits_pence, 0)                                                                       AS loan_to_deposit,
    pos.goodwill_pence::numeric / NULLIF(pos.book_equity_pence, 0)                                                                 AS goodwill_share_of_capital,
    ar.behind_pence::numeric / NULLIF(ar.balance_pence, 0)                                                                         AS arrears_30_plus,
    ar.behind_60_pence::numeric / NULLIF(ar.balance_pence, 0)                                                                      AS arrears_60_plus,
    rk.rate_sensitivity_pence, rk.survival_horizon_days, rk.wholesale_share, rk.top10_depositor_share, rk.change_meter
  FROM bank.regulatory_snapshot r
  JOIN bank.v_game g ON g.game_id = r.game_id
  LEFT JOIN bank.v_month_pl pl ON (pl.game_id, pl.year, pl.month) = (r.game_id, r.year, r.month)
  LEFT JOIN pos ON (pos.game_id, pos.year, pos.month) = (r.game_id, r.year, r.month)
  LEFT JOIN bank.v_arrears ar ON (ar.game_id, ar.year, ar.month) = (r.game_id, r.year, r.month)
  LEFT JOIN bank.risk_month rk ON (rk.game_id, rk.year, rk.month) = (r.game_id, r.year, r.month);

CREATE VIEW bank.metric_year AS                      -- bank by year: return on capital against what similar banks earned
  SELECT y.game_id, y.year, y.status, y.letter, y.score, y.return_on_capital, y.peer_benchmark,
    y.return_on_capital - y.peer_benchmark AS return_vs_peers
  FROM bank.year_result y JOIN bank.v_game g ON g.game_id = y.game_id;

CREATE VIEW bank.metric_decision_accuracy AS         -- by decision maker and case type
  SELECT decided_by, kind AS case_type, count(*) AS decisions, count(*) FILTER (WHERE consistent) AS consistent_decisions,
    (count(*) FILTER (WHERE consistent))::numeric / count(*) AS accuracy
  FROM bank.v_decision_truth WHERE consistent IS NOT NULL
  GROUP BY decided_by, kind;

CREATE VIEW bank.metric_fraud_month AS               -- from the cases the player decided: how many true frauds were blocked, and how many blocks were genuine customers
  SELECT game_id, year, month,
    count(*) FILTER (WHERE is_fraud) AS true_frauds,
    count(*) FILTER (WHERE is_fraud AND chosen = 'block') AS frauds_blocked,
    count(*) FILTER (WHERE chosen = 'block') AS blocks,
    count(*) FILTER (WHERE NOT is_fraud AND chosen = 'block') AS genuine_blocked,
    (count(*) FILTER (WHERE is_fraud AND chosen = 'block'))::numeric / NULLIF(count(*) FILTER (WHERE is_fraud), 0) AS fraud_detection,
    (count(*) FILTER (WHERE NOT is_fraud AND chosen = 'block'))::numeric / NULLIF(count(*) FILTER (WHERE chosen = 'block'), 0) AS false_alarm_rate
  FROM bank.v_decision_truth WHERE kind = 'fraud'
  GROUP BY game_id, year, month;

CREATE VIEW bank.metric_alerts_month AS              -- from the operations model: detection and false alarms at the thresholds the player set
  SELECT a.game_id, a.year, a.month, a.kind, a.true_cases, a.caught, a.missed, a.false_alerts, a.unreviewed,
    a.caught / NULLIF(a.true_cases, 0) AS detection_rate,
    a.false_alerts / NULLIF(a.caught + a.false_alerts, 0) AS false_alarm_rate
  FROM bank.alert_month a JOIN bank.v_game g ON g.game_id = a.game_id;

CREATE VIEW bank.metric_team_month AS                -- by team: how loaded it is and how old its oldest work is
  SELECT t.game_id, t.year, t.month, t.team, t.staff, t.utilisation,
    t.backlog / NULLIF(t.capacity, 0) AS oldest_case_age_months
  FROM bank.team_month t JOIN bank.v_game g ON g.game_id = t.game_id;

CREATE VIEW bank.metric_product_month AS             -- by product: what it earned after its losses and costs
  SELECT p.game_id, p.year, p.month, p.product, p.revenue_pence, p.loss_pence, p.cost_pence,
    p.revenue_pence - p.loss_pence - p.cost_pence AS margin_pence,
    sum(p.revenue_pence - p.loss_pence - p.cost_pence) OVER (PARTITION BY p.game_id, p.product ORDER BY p.year, p.month) AS cumulative_margin_pence
  FROM bank.product_month p JOIN bank.v_game g ON g.game_id = p.game_id;

CREATE VIEW bank.metric_conduct_month AS             -- upheld complaints against the sales that led to them
  SELECT i.game_id, i.year, i.month, i.sales_index, i.upheld_12m,
    i.upheld_12m * 1000.0 / NULLIF(sum(i.sales) OVER (PARTITION BY i.game_id ORDER BY i.year, i.month ROWS BETWEEN 11 PRECEDING AND CURRENT ROW), 0) AS complaints_per_1000_sales
  FROM bank.incentive_month i JOIN bank.v_game g ON g.game_id = i.game_id;

-- ---------------------------------------------------------------------------------------------------------------------
-- A read-only role for analysis: it sees the metric views and nothing else. On Lakebase the deploy creates the login role and
-- grants it this one (databricks_create_role), because a managed database may not let a migration create roles.
-- ---------------------------------------------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bank_analysis') THEN
    BEGIN
      CREATE ROLE bank_analysis NOLOGIN;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'could not create role bank_analysis; create it and grant it the metric views by hand';
    END;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bank_analysis') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA bank TO bank_analysis';
    EXECUTE 'GRANT SELECT ON bank.metric_month, bank.metric_year, bank.metric_decision_accuracy, bank.metric_fraud_month, bank.metric_alerts_month, '
         || 'bank.metric_team_month, bank.metric_product_month, bank.metric_conduct_month, bank."case", bank.document, '
         || 'bank.literacy_progress, bank.literacy_by_concept, bank.literacy_with_play TO bank_analysis';
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Every table carries its reference vocabulary in a comment (FIBO, with the Universal Ontology Platform where FIBO has no coverage)
-- ---------------------------------------------------------------------------------------------------------------------
COMMENT ON TABLE bank.game IS 'Game metadata: seed, mode, scenario, engine version, status and the opaque player key.';
COMMENT ON TABLE bank.game_state IS 'Game metadata: the current state of a game, kept so a command can be applied without replaying.';
COMMENT ON TABLE bank.command IS 'Game metadata: the ordered player commands, which are the replay source.';
COMMENT ON TABLE bank.event IS 'FIBO FND occurrences; UOP Event. Everything the engine reported.';
COMMENT ON TABLE bank.party IS 'FIBO FND parties; BE for legal entities. Customers, businesses and the bank. Synthetic.';
COMMENT ON TABLE bank.party_role IS 'FIBO FND party roles. Borrower and guarantor. Synthetic.';
COMMENT ON TABLE bank.agreement IS 'FIBO LOAN; FND agreements. Mortgages, loans and cards. Synthetic.';
COMMENT ON TABLE bank.collateral IS 'FIBO LOAN real-estate collateral; UOP Asset.';
COMMENT ON TABLE bank.account IS 'FIBO FBC accounts. Deposit balances. Synthetic.';
COMMENT ON TABLE bank.security_holding IS 'FIBO SEC debt instruments. Month-end gilts.';
COMMENT ON TABLE bank.gl_account IS 'FIBO FND accounting (partial). The chart of accounts.';
COMMENT ON TABLE bank.journal_entry IS 'FIBO FND accounting (partial). A balanced journal entry.';
COMMENT ON TABLE bank.journal_line IS 'FIBO FND accounting (partial). One line of a journal entry; debit positive, credit negative.';
COMMENT ON TABLE bank.position_snapshot IS 'FIBO LOAN status; FND accounting. Month-end balance of every ledger account.';
COMMENT ON TABLE bank.portfolio_cohort IS 'FIBO LOAN status. Loans grouped by product, risk band and month of issue.';
COMMENT ON TABLE bank.regulatory_snapshot IS 'No FIBO coverage; returns-style layout. Capital, liquidity and standing each month.';
COMMENT ON TABLE bank.market_state IS 'FIBO IND indicators. Bank Rate, unemployment, house prices, share index and inflation each month.';
COMMENT ON TABLE bank.policy_setting IS 'UOP Policy. Every rule and the month it took effect.';
COMMENT ON TABLE bank.decision IS 'UOP Event. Who decided what, the options shown, the papers on the desk and the hidden true outcome.';
COMMENT ON TABLE bank.household IS 'FIBO FND parties; UOP Party. A recurring household.';
COMMENT ON TABLE bank.household_month IS 'FIBO FND parties; UOP Party and Obligation. A household''s money in a month.';
COMMENT ON TABLE bank.literacy_check IS 'No FIBO coverage. The five-question financial literacy check.';
COMMENT ON TABLE bank.risk_month IS 'No FIBO coverage; returns-style layout. Rate sensitivity, survival horizon and funding concentration.';
COMMENT ON TABLE bank.year_result IS 'Return on capital against the peer benchmark, rating and outcome for each year.';
COMMENT ON TABLE bank.alert_month IS 'UOP Claim and Event. Fraud and money-laundering alerts, detection and false alarms.';
COMMENT ON TABLE bank.product_month IS 'FIBO FBC products and services. A product''s revenue, losses and costs in a month.';
COMMENT ON TABLE bank.hedge_position IS 'FIBO DER swaps. Notional, value and collateral across all swaps each month.';
COMMENT ON TABLE bank.product_review IS 'FIBO FBC products and services. The regulator''s fair value review of a product.';
COMMENT ON VIEW bank.metric_month IS 'The metric definitions in db/semantic/bank_metrics.yaml, by bank and month.';
COMMENT ON VIEW bank."case" IS 'UOP Claim and Event. Alerts that needed a decision, and whether each was true.';
COMMENT ON VIEW bank.document IS 'UOP Document. The papers shown on the desk for each decision.';
