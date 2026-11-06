'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { tokenSource, TTL_MS } = require('../server/lakebase');

function fake() {
  const calls = [];
  const fetchImpl = async (url, o) => {
    calls.push({ url, o });
    if (url.endsWith('/oidc/v1/token')) return { ok: true, status: 200, json: async () => ({ access_token: 'acc' }) };
    return { ok: true, status: 200, json: async () => ({ token: 'db-' + calls.length }) };
  };
  return { calls, fetchImpl };
}

test('lakebase credentials: exchanged once, cached, renewed after 45 minutes, shared by concurrent callers', async () => {
  const { calls, fetchImpl } = fake(); let now = 1000;
  const get = tokenSource({ host: 'https://h/', clientId: 'id', clientSecret: 's', endpoint: 'projects/p/branches/b/endpoints/e', fetchImpl, clock: () => now });
  const [a, b] = await Promise.all([get(), get()]);
  assert.strictEqual(a, b); assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[0].url, 'https://h/oidc/v1/token');
  assert.match(calls[0].o.headers.authorization, /^Basic /);
  assert.strictEqual(calls[1].url, 'https://h/api/2.0/postgres/credentials');
  assert.strictEqual(calls[1].o.headers.authorization, 'Bearer acc');
  assert.deepStrictEqual(JSON.parse(calls[1].o.body), { endpoint: 'projects/p/branches/b/endpoints/e' });
  assert.strictEqual(await get(), a); assert.strictEqual(calls.length, 2);
  now += TTL_MS + 1;
  assert.notStrictEqual(await get(), a); assert.strictEqual(calls.length, 4);
});

test('lakebase credentials: a failed login is an error, not a stuck state', async () => {
  let ok = false;
  const get = tokenSource({ host: 'https://h', clientId: 'i', clientSecret: 's', endpoint: 'e',
    fetchImpl: async (url) => url.endsWith('/token') ? { ok, status: ok ? 200 : 401, json: async () => ({ access_token: 'a' }) } : { ok: true, json: async () => ({ token: 't' }) } });
  await assert.rejects(get(), /login failed \(401\)/);
  ok = true; assert.strictEqual(await get(), 't');
});
