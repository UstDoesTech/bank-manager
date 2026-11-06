-- Step 3b: wholesale borrowing and dividends. Gilts are carried at cost, or at market value for a player who owns treasury.
INSERT INTO bank.gl_account (code, name, type, normal_side) VALUES
  ('wholesale',       'Wholesale borrowing',                      'liability', 'credit'),
  ('equity.dividend', 'Dividends paid',                           'equity',    'debit');
UPDATE bank.gl_account SET name = 'Gilts (cost, or market value under treasury policy)' WHERE code = 'gilts';
UPDATE bank.gl_account SET name = 'Gains, losses and revaluation on gilts and asset sales' WHERE code = 'pl.gilts';
