-- Gives a Databricks identity read-only access to the metric views and nothing else. Run as the administrator after the
-- migrations:   scripts/pg.sh -v analyst="<client id>" -f scripts/analysis-role.sql
-- The group role bank_analysis is normally created by migration 012; it is created here if a managed database stopped that.
CREATE EXTENSION IF NOT EXISTS databricks_auth;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bank_analysis') THEN CREATE ROLE bank_analysis NOLOGIN; END IF; END $$;
GRANT USAGE ON SCHEMA bank TO bank_analysis;
GRANT SELECT ON bank.metric_month, bank.metric_year, bank.metric_decision_accuracy, bank.metric_fraud_month, bank.metric_alerts_month,
  bank.metric_team_month, bank.metric_product_month, bank.metric_conduct_month, bank."case", bank.document,
  bank.literacy_progress, bank.literacy_by_concept, bank.literacy_with_play, bank.metric_ambition_year, bank.metric_ambition, bank.metric_rival_month, bank.metric_rival TO bank_analysis;
SELECT databricks_create_role(:'analyst', 'SERVICE_PRINCIPAL') WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'analyst');
GRANT bank_analysis TO :"analyst";
