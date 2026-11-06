'use strict';
// Lakebase (Postgres on Databricks) sign-in. The app logs in as a service principal: it gets a Databricks OAuth token
// (client credentials), exchanges it for a short-lived database credential, and uses that as the Postgres password.
// Credentials last an hour; one is renewed after 45 minutes, and the pool asks for the password on every new connection.
const TTL_MS = 45 * 60 * 1000;

function tokenSource({ host, clientId, clientSecret, endpoint, fetchImpl = fetch, clock = Date.now }) {
  let token = '', at = 0, inflight = null;
  const base = host.replace(/\/$/, '');
  async function fetchToken() {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const a = await fetchImpl(`${base}/oidc/v1/token`, {
      method: 'POST', headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials&scope=all-apis',
    });
    if (!a.ok) throw new Error(`Databricks login failed (${a.status})`);
    const access = (await a.json()).access_token;
    const b = await fetchImpl(`${base}/api/2.0/postgres/credentials`, {
      method: 'POST', headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    });
    if (!b.ok) throw new Error(`Lakebase credential request failed (${b.status})`);
    return (await b.json()).token;
  }
  return async function get(force = false) {
    if (!force && token && clock() - at < TTL_MS) return token;
    inflight = inflight || fetchToken().then((t) => { token = t; at = clock(); return t; }).finally(() => { inflight = null; });
    return inflight;
  };
}

module.exports = { tokenSource, TTL_MS };
