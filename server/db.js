'use strict';
const fs = require('fs'), path = require('path');
const { Pool } = require('pg');

// Local and tests: a plain connection string. On Azure: LAKEBASE_ENDPOINT is set and the password is a short-lived
// credential for the app's service principal (see lakebase.js).
function createPool(url, env = process.env) {
  if (!env.LAKEBASE_ENDPOINT) return new Pool({ connectionString: url, max: 10 });
  const { tokenSource } = require('./lakebase');
  const password = tokenSource({ host: env.DATABRICKS_HOST, clientId: env.DATABRICKS_CLIENT_ID,
    clientSecret: env.DATABRICKS_CLIENT_SECRET, endpoint: env.LAKEBASE_ENDPOINT });
  return new Pool({ host: env.PGHOST, database: env.PGDATABASE, user: env.DATABRICKS_CLIENT_ID, password: () => password(),
    port: 5432, ssl: { rejectUnauthorized: true }, max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 15000 });
}

// Runs db/migrations/*.sql in order, once each, under an advisory lock so two servers starting together are safe.
async function migrate(pool, dir = path.join(__dirname, '..', 'db', 'migrations')) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(727274)');
    await client.query('CREATE TABLE IF NOT EXISTS public.schema_migration (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const done = new Set((await client.query('SELECT name FROM public.schema_migration')).rows.map((r) => r.name));
    const applied = [];
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      if (done.has(f)) continue;
      await client.query('BEGIN');
      try {
        await client.query(fs.readFileSync(path.join(dir, f), 'utf8'));
        await client.query('INSERT INTO public.schema_migration (name) VALUES ($1)', [f]);
        await client.query('COMMIT');
        applied.push(f);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`migration ${f} failed: ${e.message}`);
      }
    }
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock(727274)').catch(() => {});
    client.release();
  }
}

module.exports = { createPool, migrate };
