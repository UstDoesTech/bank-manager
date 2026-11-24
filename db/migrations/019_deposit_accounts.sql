-- Customers' own deposit accounts, and value dates. In a game with the accounts option, a customer who opens an account at the
-- counter has one in their name: a current account, an easy-access saver, a cash ISA, a two-year fixed saver or a business
-- account. What they pay in, take out and earn is posted to it; the rest of the retail deposits stay in one pool, and large
-- depositors keep their own. Every deposit posting names where it belongs, so the deposits reconcile to the general ledger the
-- way the loans do. Each journal entry has a value day where the game knows one: a day in the week it happened in a weekly
-- game, the last day of the month at month end.

ALTER TABLE bank.game ADD COLUMN accounts boolean NOT NULL DEFAULT false;
UPDATE bank.game g SET accounts = coalesce((c.payload -> 'opts' ->> 'accounts')::boolean, false) AND coalesce((c.payload -> 'opts' ->> 'characters')::boolean, false) AND NOT g.tutorial AND g.scenario IS NULL
  FROM bank.command c WHERE c.game_id = g.id AND c.seq = 1;

INSERT INTO bank.product_catalogue (product, product_name, family, ledger_account, pricing, description) VALUES
  ('cash_isa',         'Cash ISA',             'deposit', 'deposits', 'The savings rate',                    'Easy access, interest free of tax.'),
  ('fixed_saver',      'Two-year fixed saver', 'deposit', 'deposits', 'The savings rate when opened, plus 0.6 points, for two years', 'Becomes an easy-access saver when it matures.'),
  ('business_current', 'Business account',     'deposit', 'deposits', 'No interest',                         'For a small business''s takings and bills.');

-- bank.account now holds customers' accounts beside the pool, the large depositors, the bonds and the households' savings
ALTER TABLE bank.account DROP CONSTRAINT account_kind_check;
ALTER TABLE bank.account ADD CONSTRAINT account_kind_check CHECK (kind IN ('easy_access', 'large_deposit', 'fixed_bond', 'household_savings', 'current_account', 'cash_isa', 'fixed_saver', 'business_current'));
ALTER TABLE bank.account
  ADD COLUMN customer_id   integer,                       -- the regular customer who holds it
  ADD COLUMN opened_year   integer,
  ADD COLUMN opened_month  integer,
  ADD COLUMN closed_year   integer,
  ADD COLUMN closed_month  integer;
COMMENT ON COLUMN bank.account.customer_id IS 'The regular customer who holds the account; null for the pool, large depositors, bonds and households.';

ALTER TABLE bank.journal_line DROP CONSTRAINT journal_line_subledger_check;
ALTER TABLE bank.journal_line ADD CONSTRAINT journal_line_subledger_check CHECK (subledger IN ('loan', 'deposit', 'large'));
COMMENT ON COLUMN bank.journal_line.subledger IS 'The account a line belongs to below the general ledger: loan (the agreement), deposit (a customer''s account, 0 for the retail pool) or large (a large depositor).';

ALTER TABLE bank.journal_entry ADD COLUMN value_day smallint CHECK (value_day BETWEEN 1 AND 31);
COMMENT ON COLUMN bank.journal_entry.value_day IS 'Day of the month the posting took effect, where the game knows it: in a weekly game the week''s day, at month end the last day.';

CREATE VIEW bank.v_journal_entry AS
  SELECT e.*, CASE WHEN e.value_day IS NULL THEN NULL ELSE make_date(e.year, e.month + 1, e.value_day) END AS value_date
  FROM bank.journal_entry e;

-- Each customer account's statement, line by line, from the customer's side: money in is positive.
CREATE VIEW bank.v_deposit_statement AS
  SELECT l.game_id, l.subledger_id AS account_no, e.seq AS entry_seq, l.line_no, e.command_seq, e.year, e.month, e.value_day,
    CASE WHEN e.value_day IS NULL THEN NULL ELSE make_date(e.year, e.month + 1, e.value_day) END AS value_date,
    CASE e.memo
      WHEN 'deposit.flow' THEN CASE WHEN l.amount_pence < 0 THEN 'paid in' ELSE 'paid out' END
      WHEN 'deposit.transfer' THEN 'moved from the bank''s pooled savings'
      WHEN 'account.month' THEN CASE WHEN l.amount_pence < 0 THEN 'salary and takings' ELSE 'spending and bills' END
      WHEN 'pl.intDep' THEN 'interest'
      ELSE e.memo END AS description,
    -l.amount_pence AS amount_pence
  FROM bank.journal_line l JOIN bank.journal_entry e ON e.game_id = l.game_id AND e.seq = l.entry_seq
  WHERE l.account = 'deposits' AND l.subledger = 'deposit' AND l.subledger_id > 0;

-- Each customer account's balance from its postings, against the balance the account records.
CREATE VIEW bank.v_deposit_ledger AS
  SELECT a.game_id, a.account_id, a.customer_id, a.kind AS product, a.status, a.balance_pence AS account_balance_pence,
    coalesce(sum(s.amount_pence), 0) AS posted_balance_pence,
    coalesce(sum(s.amount_pence) FILTER (WHERE s.description = 'interest'), 0) AS interest_pence,
    count(s.entry_seq)::int AS postings
  FROM bank.account a
  LEFT JOIN bank.v_deposit_statement s ON s.game_id = a.game_id AND a.account_id = 'acct-' || s.account_no
  WHERE a.customer_id IS NOT NULL OR a.account_id LIKE 'acct-%'
  GROUP BY a.game_id, a.account_id, a.customer_id, a.kind, a.status, a.balance_pence;

-- Deposits against the general ledger: the control account, and what the pool, the customers' accounts and the large
-- depositors add up to. Nothing should be left over in a game recorded after this migration.
CREATE VIEW bank.v_deposit_reconciliation AS
  SELECT game_id, -sum(amount_pence) AS control_pence,
    -coalesce(sum(amount_pence) FILTER (WHERE subledger = 'deposit' AND subledger_id = 0), 0) AS pool_pence,
    -coalesce(sum(amount_pence) FILTER (WHERE subledger = 'deposit' AND subledger_id > 0), 0) AS customer_accounts_pence,
    -coalesce(sum(amount_pence) FILTER (WHERE subledger = 'large'), 0) AS large_deposits_pence,
    -coalesce(sum(amount_pence) FILTER (WHERE subledger IS NULL), 0) AS unattributed_pence
  FROM bank.journal_line WHERE account = 'deposits' GROUP BY game_id;

-- What each customer holds: their loans and their deposit accounts.
DROP VIEW bank.v_customer_holding;
CREATE VIEW bank.v_customer_holding AS
  SELECT c.game_id, c.customer_id, pe.full_name, c.kyc_status, 'loan' AS holding, a.agreement_id::text AS reference, a.product, a.status, a.balance_pence, a.rate_pct
  FROM bank.customer c JOIN bank.person pe ON pe.person_id = c.person_id
  JOIN bank.party p ON p.game_id = c.game_id AND p.customer_id = c.customer_id
  JOIN bank.agreement a ON a.game_id = p.game_id AND a.party_id = p.party_id
  UNION ALL
  SELECT c.game_id, c.customer_id, pe.full_name, c.kyc_status, 'deposit', d.account_id, d.kind, d.status, d.balance_pence, d.rate_pct
  FROM bank.customer c JOIN bank.person pe ON pe.person_id = c.person_id
  JOIN bank.account d ON d.game_id = c.game_id AND d.customer_id = c.customer_id;

-- What each product costs now: the current settings over the latest Bank Rate the game recorded.
DROP VIEW bank.v_price_list;
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
    ('easy_access', 'Savings rate',         s.saver),
    ('cash_isa', 'Savings rate',            s.saver),
    ('fixed_saver', 'Two years, if opened now', s.saver + 0.6)) AS t(product, tier, rate_pct)
  JOIN bank.product_catalogue p ON p.product = t.product;

