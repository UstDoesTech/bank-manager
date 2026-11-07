-- Growth: products, fair value reviews, incentives, acquisitions and the branch network.
INSERT INTO bank.gl_account (code, name, type, normal_side) VALUES
  ('goodwill',         'Goodwill on acquisitions',        'asset',  'debit'),
  ('equity.writedown', 'Goodwill written down',           'equity', 'debit');

CREATE TABLE bank.product (
  game_id     uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  product     text NOT NULL,
  start_abs   integer NOT NULL,                                        -- year * 12 + month
  status      text NOT NULL CHECK (status IN ('live', 'withdrawn')),
  repriced    boolean NOT NULL DEFAULT false,                          -- cut in price after a failed fair value review
  revenue_pence bigint NOT NULL DEFAULT 0,                             -- cumulative
  PRIMARY KEY (game_id, product)
);
CREATE TABLE bank.product_review (
  game_id  uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  year     integer NOT NULL,
  month    integer NOT NULL,
  product  text NOT NULL,
  failed   boolean NOT NULL,
  PRIMARY KEY (game_id, year, month, product)
);
CREATE TABLE bank.acquisition (
  game_id           uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  acquisition_id    integer NOT NULL,
  target            text NOT NULL,
  price_pence       bigint NOT NULL,
  book_pence        bigint NOT NULL,
  goodwill_pence    bigint NOT NULL,
  diligence         text NOT NULL CHECK (diligence IN ('light', 'standard', 'deep')),
  start_abs         integer NOT NULL,
  hidden_loss_pct   numeric(6, 3) NOT NULL,                            -- the truth the engine knew; not shown to the player
  status            text NOT NULL,
  PRIMARY KEY (game_id, acquisition_id)
);
CREATE TABLE bank.incentive_month (
  game_id      uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  year         integer NOT NULL,
  month        integer NOT NULL,
  sales_index  numeric(6, 3) NOT NULL,                                 -- sales against normal
  mis_sold     numeric(8, 2) NOT NULL,                                 -- hidden mis-selling flags raised this month
  culture      numeric(6, 1) NOT NULL,                                 -- hidden culture score
  upheld_12m   integer NOT NULL,
  PRIMARY KEY (game_id, year, month)
);
CREATE TABLE bank.branch_site (
  game_id  uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  town     text NOT NULL,
  state    text NOT NULL CHECK (state IN ('none', 'hub', 'branch')),
  since_abs integer NOT NULL,                                          -- year * 12 + month the state began
  PRIMARY KEY (game_id, town, since_abs)
);
COMMENT ON TABLE bank.product IS 'Products launched from the catalogue. FIBO FBC products. Synthetic.';
COMMENT ON TABLE bank.acquisition IS 'Acquisitions with the hidden loss rate the engine knew. FIBO BE ownership and control. Synthetic.';
COMMENT ON TABLE bank.incentive_month IS 'Sales, hidden mis-selling flags and culture by month. UOP Policy and Obligation. Synthetic.';
COMMENT ON TABLE bank.branch_site IS 'Towns, branch type and when it changed. FIBO FND places; UOP Location. Synthetic.';
