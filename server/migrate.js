'use strict';
// Applies db/migrations once and exits. The deploy runs this as the database administrator:  node server/migrate.js
// Uses DATABASE_URL, or, for Lakebase, LAKEBASE_ENDPOINT with PGHOST, PGDATABASE and the DATABRICKS_* login.
const config = require('./config');
const { createPool, migrate } = require('./db');
(async () => {
  const pool = createPool(config.databaseUrl);
  const applied = await migrate(pool);
  console.log(applied.length ? 'applied ' + applied.join(', ') : 'nothing to apply');
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
