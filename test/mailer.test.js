'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { createMailer, createResendMailer, createDevMailer } = require('../server/mailer');

function fakePool() { const rows = []; return { rows, query: async (sql, args) => { rows.push(args); } }; }
function fakeFetch(status = 200) { const calls = []; return { calls, fn: async (url, o) => { calls.push({ url, o }); return { ok: status < 300, status }; } }; }
const logger = () => { const errors = []; return { errors, error: (...a) => errors.push(a), info: () => {} }; };

test('mailer: with a Resend key the mail goes out through Resend and is not kept in the database', async () => {
  const pool = fakePool(), f = fakeFetch();
  const m = createMailer({ pool, env: { RESEND_API_KEY: 're_key', MAIL_FROM: 'Bank Manager <noreply@example.org>' }, fetchImpl: f.fn });
  await m.send({ to: 'pat@example.com', subject: 'Confirm', body: 'link here' });
  assert.strictEqual(f.calls.length, 1); assert.strictEqual(f.calls[0].url, 'https://api.resend.com/emails');
  assert.strictEqual(f.calls[0].o.method, 'POST'); assert.strictEqual(f.calls[0].o.headers.authorization, 'Bearer re_key');
  assert.deepStrictEqual(JSON.parse(f.calls[0].o.body), { from: 'Bank Manager <noreply@example.org>', to: ['pat@example.com'], subject: 'Confirm', text: 'link here' });
  assert.strictEqual(pool.rows.length, 0, 'a real player\'s link is not stored in the outbox');
});

test('mailer: addresses at smoke.invalid stay on the server even when Resend is on, so the deploy test can read its link', async () => {
  const pool = fakePool(), f = fakeFetch();
  const m = createMailer({ pool, env: { RESEND_API_KEY: 'k', MAIL_FROM: 'a@b.c' }, fetchImpl: f.fn });
  await m.send({ to: 'smoke-1@smoke.invalid', subject: 'Confirm', body: 'https://x/api/confirm?token=abc' });
  assert.strictEqual(f.calls.length, 0); assert.deepStrictEqual(pool.rows, [['smoke-1@smoke.invalid', 'Confirm', 'https://x/api/confirm?token=abc']]);
});

test('mailer: a failed send is logged without the address and does not fail the request', async () => {
  const log = logger();
  for (const f of [fakeFetch(500), { calls: [], fn: async () => { throw new Error('network down'); } }]) {
    const m = createResendMailer({ apiKey: 'k', from: 'a@b.c', pool: fakePool(), log, fetchImpl: f.fn });
    await m.send({ to: 'pat@example.com', subject: 'Confirm', body: 'x' });          // does not throw
  }
  assert.strictEqual(log.errors.length, 2);
  for (const [meta] of log.errors) { assert.strictEqual(meta.domain, 'example.com'); assert(!JSON.stringify(meta).includes('pat@')); }
});

test('mailer: without a key mail is written to the outbox, and a key without a sender is refused at start', async () => {
  const pool = fakePool();
  await createMailer({ pool, env: {} }).send({ to: 'a@b.co', subject: 's', body: 'b' });
  assert.deepStrictEqual(pool.rows, [['a@b.co', 's', 'b']]);
  assert.throws(() => createMailer({ pool, env: { RESEND_API_KEY: 'k' } }), /MAIL_FROM/);
  assert.strictEqual(typeof createDevMailer(pool).send, 'function');
});
