-- Interest-rate swaps, the collateral posted on them, and the month-end maturity ladder.
INSERT INTO bank.gl_account (code, name, type, normal_side) VALUES
  ('collateral', 'Cash collateral posted on swaps', 'asset',  'debit'),
  ('pl.swaps',   'Swap settlements',                'income', 'credit');

CREATE TABLE bank.hedge (                                              -- pay-fixed swaps against the fixed-rate mortgage book
  game_id        uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  swap_id        integer NOT NULL,
  notional_pence bigint NOT NULL,
  fixed_rate_pct numeric(6, 3) NOT NULL,                               -- paid; the bank receives Bank Rate
  term_months    integer NOT NULL,
  start_year     integer NOT NULL,
  start_month    integer NOT NULL,
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  PRIMARY KEY (game_id, swap_id)
);
CREATE TABLE bank.hedge_position (                                     -- month-end position across all swaps
  game_id          uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  year             integer NOT NULL,
  month            integer NOT NULL,
  notional_pence   bigint NOT NULL,
  mtm_pence        bigint NOT NULL,                                    -- value to the bank: negative means it is under water
  collateral_pence bigint NOT NULL,
  PRIMARY KEY (game_id, year, month)
);
CREATE TABLE bank.liquidity_ladder (                                   -- what falls due and what is repaid, by time bucket
  game_id       uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  year          integer NOT NULL,
  month         integer NOT NULL,
  bucket        text NOT NULL,
  inflow_pence  bigint NOT NULL,
  outflow_pence bigint NOT NULL,
  cover_pence   bigint NOT NULL,                                       -- cash, gilts and cumulative net flows, less a stressed run
  PRIMARY KEY (game_id, year, month, bucket)
);
COMMENT ON TABLE bank.hedge IS 'Pay-fixed interest-rate swaps. FIBO DER swaps. Synthetic.';
COMMENT ON TABLE bank.liquidity_ladder IS 'Maturity ladder by bucket each month. Returns-style layout; no FIBO coverage.';
