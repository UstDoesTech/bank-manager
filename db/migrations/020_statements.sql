-- Statements that read like a bank's. Each journal entry can carry a narrative ("Interest: 31 days at 2.50%", "Returned unpaid:
-- the £2,000 paid in on 9 Mar") and the entry it corrects: a payment returned unpaid reverses the payment in, and a refund names the
-- payment it puts right. Corrections are new entries, never edits: the journal stays append-only.

ALTER TABLE bank.journal_entry ADD COLUMN narrative text;
ALTER TABLE bank.journal_entry ADD COLUMN corrects integer;
ALTER TABLE bank.journal_entry ADD CONSTRAINT journal_entry_corrects_fkey FOREIGN KEY (game_id, corrects) REFERENCES bank.journal_entry (game_id, seq);
COMMENT ON COLUMN bank.journal_entry.narrative IS 'What the customer would read on their statement.';
COMMENT ON COLUMN bank.journal_entry.corrects IS 'The entry this one reverses or puts right: a payment returned unpaid, a refund of a fraudulent payment.';

DROP VIEW bank.v_journal_entry;
CREATE VIEW bank.v_journal_entry AS
  SELECT e.*, CASE WHEN e.value_day IS NULL THEN NULL ELSE make_date(e.year, e.month + 1, e.value_day) END AS value_date
  FROM bank.journal_entry e;

DROP VIEW bank.v_deposit_ledger;
DROP VIEW bank.v_deposit_statement;
CREATE VIEW bank.v_deposit_statement AS
  SELECT l.game_id, l.subledger_id AS account_no, e.seq AS entry_seq, l.line_no, e.command_seq, e.year, e.month, e.value_day,
    CASE WHEN e.value_day IS NULL THEN NULL ELSE make_date(e.year, e.month + 1, e.value_day) END AS value_date,
    CASE e.memo
      WHEN 'deposit.flow' THEN CASE WHEN l.amount_pence < 0 THEN 'paid in' ELSE 'paid out' END
      WHEN 'deposit.transfer' THEN 'transfer in'
      WHEN 'deposit.return' THEN 'returned unpaid'
      WHEN 'account.month' THEN CASE WHEN l.amount_pence < 0 THEN 'salary and takings' ELSE 'spending and bills' END
      WHEN 'pl.intDep' THEN 'interest'
      WHEN 'pl.redress' THEN 'refund'
      ELSE e.memo END AS description,
    e.narrative, e.corrects,
    -l.amount_pence AS amount_pence
  FROM bank.journal_line l JOIN bank.journal_entry e ON e.game_id = l.game_id AND e.seq = l.entry_seq
  WHERE l.account = 'deposits' AND l.subledger = 'deposit' AND l.subledger_id > 0;

CREATE VIEW bank.v_deposit_ledger AS
  SELECT a.game_id, a.account_id, a.customer_id, a.kind AS product, a.status, a.balance_pence AS account_balance_pence,
    coalesce(sum(s.amount_pence), 0) AS posted_balance_pence,
    coalesce(sum(s.amount_pence) FILTER (WHERE s.description = 'interest'), 0) AS interest_pence,
    count(s.entry_seq)::int AS postings
  FROM bank.account a
  LEFT JOIN bank.v_deposit_statement s ON s.game_id = a.game_id AND a.account_id = 'acct-' || s.account_no
  WHERE a.customer_id IS NOT NULL OR a.account_id LIKE 'acct-%'
  GROUP BY a.game_id, a.account_id, a.customer_id, a.kind, a.status, a.balance_pence;

DROP VIEW bank.v_loan_ledger;
DROP VIEW bank.v_loan_statement;
CREATE VIEW bank.v_loan_statement AS
  SELECT l.game_id, l.subledger_id AS agreement_id, e.seq AS entry_seq, e.command_seq, e.year, e.month, e.value_day,
    CASE WHEN e.value_day IS NULL THEN NULL ELSE make_date(e.year, e.month + 1, e.value_day) END AS value_date,
    CASE e.memo WHEN 'loan.originate' THEN 'drawdown' WHEN 'loan.repay' THEN 'repayment' WHEN 'pl.intLoans' THEN 'interest'
                WHEN 'pl.fees' THEN 'fee' WHEN 'loan.writeoff' THEN 'write-off' WHEN 'loan.sell' THEN 'sold' WHEN 'pool.sale' THEN 'sold' ELSE e.memo END AS transaction_type,
    e.narrative,
    sum(l.amount_pence) FILTER (WHERE l.account = 'loans') AS principal_pence,
    -sum(l.amount_pence) FILTER (WHERE l.account IN ('pl.intLoans', 'pl.fees')) AS charged_pence,
    sum(l.amount_pence) FILTER (WHERE l.account = 'pl.losses') AS loss_pence
  FROM bank.journal_line l JOIN bank.journal_entry e ON e.game_id = l.game_id AND e.seq = l.entry_seq
  WHERE l.subledger = 'loan'
  GROUP BY l.game_id, l.subledger_id, e.seq, e.command_seq, e.year, e.month, e.value_day, e.memo, e.narrative;

CREATE VIEW bank.v_loan_ledger AS
  SELECT a.game_id, a.agreement_id, a.product, a.status, a.balance_pence AS agreement_balance_pence,
    coalesce(sum(s.principal_pence), 0) AS posted_balance_pence,
    coalesce(sum(s.charged_pence) FILTER (WHERE s.transaction_type = 'interest'), 0) AS interest_paid_pence,
    coalesce(sum(s.charged_pence) FILTER (WHERE s.transaction_type = 'fee'), 0) AS fees_paid_pence,
    coalesce(sum(s.loss_pence), 0) AS loss_pence,
    count(s.entry_seq)::int AS postings
  FROM bank.agreement a LEFT JOIN bank.v_loan_statement s ON s.game_id = a.game_id AND s.agreement_id = a.agreement_id
  GROUP BY a.game_id, a.agreement_id, a.product, a.status, a.balance_pence;

-- Every correction beside what it corrects.
CREATE VIEW bank.v_correction AS
  SELECT c.game_id, c.seq AS entry_seq, c.memo, c.narrative, c.year, c.month, c.value_day,
         o.seq AS corrects_seq, o.memo AS corrects_memo, o.narrative AS corrects_narrative, o.year AS corrects_year, o.month AS corrects_month, o.value_day AS corrects_value_day
  FROM bank.journal_entry c JOIN bank.journal_entry o ON o.game_id = c.game_id AND o.seq = c.corrects;
