'use strict';
const fs = require('fs'), path = require('path');
const Fastify = require('fastify');
const config = require('./config');
const { createPool, migrate } = require('./db');
const { createHost } = require('./engine-host');
const { createDevMailer } = require('./mailer');
const auth = require('./auth');
const games = require('./games');

const PAGE = path.join(__dirname, '..', 'Bank Manager.html');

// Builds the server. Tests pass their own pool and config; index.js passes the real ones.
async function build({ pool, cfg = config, logger = true, mailer } = {}) {
  const app = Fastify({ logger, trustProxy: true, bodyLimit: 64 * 1024 });
  const db = pool || createPool(cfg.databaseUrl);
  await app.register(require('@fastify/cookie'));
  const host = createHost();

  // Anything that changes data must be JSON, so a cross-site HTML form cannot trigger it.
  app.addHook('onRequest', async (req, reply) => {
    if (['POST', 'DELETE', 'PUT', 'PATCH'].includes(req.method) && req.url.startsWith('/api/')) {
      const ct = String(req.headers['content-type'] || '');
      if (!ct.startsWith('application/json') && Number(req.headers['content-length'] || 0) > 0) return reply.code(415).send({ error: 'unsupported_media_type' });
    }
  });
  app.addHook('onSend', async (req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'same-origin');
    if (req.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
  });
  app.setErrorHandler((err, req, reply) => {
    if (err.status && err.code) return reply.code(err.status).send({ error: err.code, message: err.message, ...(err.extra || {}) });
    if (err.validation || err.statusCode === 400) return reply.code(400).send({ error: 'bad_request', message: err.message });
    req.log.error(err);
    reply.code(500).send({ error: 'server_error', message: 'Something went wrong.' });
  });

  auth.register(app, { pool: db, mailer: mailer || createDevMailer(db, logger ? app.log : null), config: cfg });
  games.register(app, { pool: db, host });
  require('./literacy').register(app, { pool: db });

  app.get('/healthz', async () => { await db.query('SELECT 1'); return { ok: true, engine: host.version }; });
  app.get('/', async (req, reply) => reply.type('text/html; charset=utf-8').send(fs.readFileSync(PAGE)));

  app.addHook('onClose', async () => { if (!pool) await db.end(); });
  return { app, pool: db, host };
}

module.exports = { build, migrate };
