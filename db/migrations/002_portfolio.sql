-- Step 3a: the loan book as a banking system sees it: who borrowed (party), what they signed (agreement), what backs it
-- (collateral) and how the book looks grouped into cohorts at each month end. Everything here is invented game data.

CREATE TABLE bank.party (
  game_id   uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  party_id  integer NOT NULL,                       -- the engine's id for the loan; one party per borrower so far
  name      text NOT NULL,                          -- invented
  kind      text NOT NULL CHECK (kind IN ('person', 'business')),
  PRIMARY KEY (game_id, party_id)
);

CREATE TABLE bank.agreement (
  game_id        uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  agreement_id   integer NOT NULL,                  -- the engine's loan id
  party_id       integer NOT NULL,
  product        text NOT NULL CHECK (product IN ('mortgage', 'personal', 'card', 'business')),
  opened_year    integer NOT NULL,
  opened_month   integer NOT NULL,
  rate_pct       numeric(6, 3) NOT NULL,
  pd             numeric(8, 6) NOT NULL,            -- probability of default at origination or last cure
  principal_pence bigint NOT NULL,                  -- balance when first recorded
  balance_pence  bigint NOT NULL,                   -- latest balance
  status         text NOT NULL CHECK (status IN ('current', 'arrears', 'plan', 'closed')),
  closed_year    integer,
  closed_month   integer,
  outcome        text CHECK (outcome IN ('sold', 'written_off')),
  guaranteed     boolean NOT NULL DEFAULT false,
  government_backed boolean NOT NULL DEFAULT false,
  PRIMARY KEY (game_id, agreement_id),
  FOREIGN KEY (game_id, party_id) REFERENCES bank.party(game_id, party_id)
);

CREATE TABLE bank.collateral (
  game_id       uuid NOT NULL,
  agreement_id  integer NOT NULL,
  kind          text NOT NULL CHECK (kind = 'residential_property'),
  value_pence   bigint NOT NULL,                    -- value when the loan was made
  ltv_pct       numeric(6, 2) NOT NULL,
  PRIMARY KEY (game_id, agreement_id),
  FOREIGN KEY (game_id, agreement_id) REFERENCES bank.agreement(game_id, agreement_id) ON DELETE CASCADE
);

CREATE TABLE bank.portfolio_cohort (                -- month-end loan book by product, risk band and month of issue
  game_id        uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  year           integer NOT NULL,
  month          integer NOT NULL,
  product        text NOT NULL,
  risk_band      text NOT NULL CHECK (risk_band IN ('low', 'medium', 'high')),
  issued         integer NOT NULL,                  -- year * 12 + month of issue
  loans          integer NOT NULL,
  balance_pence  bigint NOT NULL,
  rate_pct       numeric(6, 3) NOT NULL,            -- balance-weighted
  pd             numeric(8, 6) NOT NULL,            -- balance-weighted
  lgd            numeric(8, 6) NOT NULL,            -- loss given default, exposure-weighted
  expected_loss_pence bigint NOT NULL,
  rwa_pence      bigint NOT NULL,                   -- risk-weighted assets
  current_pence  bigint NOT NULL,
  days_30_pence  bigint NOT NULL,
  days_60_pence  bigint NOT NULL,
  plan_pence     bigint NOT NULL,                   -- on a payment plan
  PRIMARY KEY (game_id, year, month, product, risk_band, issued)
);

COMMENT ON TABLE bank.party IS 'Borrower. FIBO FND/AgentsAndPeople. Synthetic.';
COMMENT ON TABLE bank.agreement IS 'A loan contract. FIBO LOAN/LoansGeneral. No 90+ day bucket: the game writes off after two months.';
COMMENT ON TABLE bank.collateral IS 'Property securing a mortgage. FIBO LOAN/RealEstateLoans.';
COMMENT ON TABLE bank.portfolio_cohort IS 'Month-end loan cohorts. Rolls up to the loans account in the ledger and to risk-weighted assets.';
