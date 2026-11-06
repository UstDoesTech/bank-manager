-- Recurring households: a small cast that stays with the bank for the whole game, and a row for each month of their money.
-- All invented. Aligned to FIBO FND parties and UOP Party and Obligation.
CREATE TABLE bank.household (
  game_id      uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  household_id integer NOT NULL,
  name         text NOT NULL,                  -- invented
  stage        text NOT NULL,                  -- student, renter, couple, family, selfemp, retiree, parent
  label        text NOT NULL,
  goal         text NOT NULL,
  PRIMARY KEY (game_id, household_id)
);

CREATE TABLE bank.household_month (
  game_id         uuid NOT NULL,
  household_id    integer NOT NULL,
  year            integer NOT NULL,
  month           integer NOT NULL,
  income_pence    bigint NOT NULL,
  spending_pence  bigint NOT NULL,
  saved_pence     bigint NOT NULL,              -- negative when overspending
  debt_pence      bigint NOT NULL,
  credit_score    integer NOT NULL,
  fund_months     numeric(6, 1) NOT NULL,       -- emergency fund in months of essential spending
  PRIMARY KEY (game_id, household_id, year, month),
  FOREIGN KEY (game_id, household_id) REFERENCES bank.household(game_id, household_id) ON DELETE CASCADE
);

COMMENT ON TABLE bank.household IS 'A recurring customer household. FIBO FND/AgentsAndPeople; UOP Party. Synthetic.';
COMMENT ON TABLE bank.household_month IS 'A household''s month: income, spending, savings, debt, credit score. UOP Obligation (partial).';
