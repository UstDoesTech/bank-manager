'use strict';
const config = require('./config');
const { build, migrate } = require('./app');

(async () => {
  const { app, pool } = await build();
  const applied = await migrate(pool);
  if (applied.length) app.log.info({ applied }, 'migrations applied');
  await app.listen({ port: config.port, host: '0.0.0.0' });
})().catch((e) => { console.error(e); process.exit(1); });
