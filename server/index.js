'use strict';
const config = require('./config');
const { build, migrate } = require('./app');

(async () => {
  const { app, pool } = await build();
  // On Azure the schema is applied by the deploy (as an administrator) and the app has no right to change it.
  const applied = process.env.MIGRATE === 'off' ? [] : await migrate(pool);
  if (applied.length) app.log.info({ applied }, 'migrations applied');
  await app.listen({ port: config.port, host: '0.0.0.0' });
})().catch((e) => { console.error(e); process.exit(1); });
