-- Fixed-term bonds and sold mortgage pools.
INSERT INTO bank.gl_account (code, name, type, normal_side) VALUES
  ('bonds',    'Fixed-term bonds',                              'liability', 'credit'),
  ('retained', 'Retained first-loss share of sold mortgages',   'asset',     'debit');
