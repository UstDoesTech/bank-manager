-- Funding instruments (wholesale loans, bonds, the Bank of England facility) and the share price.
CREATE TABLE bank.funding_instrument (
  game_id        uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  instrument_id  text NOT NULL,
  kind           text NOT NULL CHECK (kind IN ('wholesale', 'bond', 'boe')),
  amount_pence   bigint NOT NULL,                                      -- the amount outstanding now (the facility moves up and down)
  rate_pct       numeric(6, 3) NOT NULL,
  start_abs      integer,                                              -- year * 12 + month it was raised; null for the facility
  maturity_abs   integer,                                              -- year * 12 + month it falls due; null means on demand
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'repaid')),
  PRIMARY KEY (game_id, instrument_id)
);
CREATE TABLE bank.share_price (
  game_id         uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  year            integer NOT NULL,
  month           integer NOT NULL,
  price           numeric(10, 3) NOT NULL,
  book_per_share  numeric(10, 3) NOT NULL,
  multiple        numeric(6, 3) NOT NULL,
  PRIMARY KEY (game_id, year, month)
);
COMMENT ON TABLE bank.funding_instrument IS 'Bonds, wholesale borrowing and central bank drawings. FIBO SEC debt instruments; FBC. Synthetic.';
COMMENT ON TABLE bank.share_price IS 'Book value per share times a multiple. Synthetic.';
