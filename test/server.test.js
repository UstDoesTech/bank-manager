'use strict';
// Integration tests: the real server against a throwaway database on the Postgres from docker-compose.
//   docker compose up -d db && npm run test:server
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { Pool } = require('pg');
const { build, migrate } = require('../server/app');
const { createPool } = require('../server/db');
const { verifyGame } = require('../server/replay');
const { loadEngine } = require('../tools/harness');
const { oracle } = require('../tools/bots');

const ADMIN = process.env.DATABASE_ADMIN_URL || 'postgres://bank:bank@localhost:5432/postgres';
const TEST_DB = 'bank_test_' + process.pid;
const URL = ADMIN.replace(/\/[^/]*$/, '/' + TEST_DB);
const cfg = { baseUrl: 'http://localhost:8080', sessionDays: 1, maxFailedLogins: 3, failedLoginWindowMinutes: 15, confirmHours: 48, resetHours: 1 };

let admin, pool, app, host;
const local = loadEngine(fs.readFileSync(path.join(__dirname, '..', 'engine', 'engine.js'), 'utf8'));   // the page's own engine

before(async () => {
  admin = new Pool({ connectionString: ADMIN });
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  pool = createPool(URL);
  await migrate(pool);
  ({ app, host } = await build({ pool, cfg, logger: false }));
});
after(async () => {
  await app.close(); await pool.end();
  await admin.query(`DROP DATABASE ${TEST_DB} WITH (FORCE)`); await admin.end();
});

// --- helpers -----------------------------------------------------------------
const PW = 'correct horse battery';
async function call(method, url, body, cookie) {
  const res = await app.inject({ method, url, payload: body, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) } });
  const set = res.headers['set-cookie'];
  const json = res.headers['content-type'] && res.headers['content-type'].includes('json') ? res.json() : null;
  return { status: res.statusCode, json, cookie: set ? String(Array.isArray(set) ? set[0] : set).split(';')[0] : null, res };
}
async function lastMail(email) {
  return (await pool.query('SELECT body FROM account.outbox WHERE recipient = $1 ORDER BY id DESC LIMIT 1', [email])).rows[0].body;
}
async function newPlayer(email, { consent = true } = {}) {
  assert.strictEqual((await call('POST', '/api/register', { email, password: PW })).status, 202);
  const token = (await lastMail(email)).match(/token=([\w-]+)/)[1];
  assert.strictEqual((await call('GET', '/api/confirm?token=' + token)).status, 302);
  const login = await call('POST', '/api/login', { email, password: PW });
  assert.strictEqual(login.status, 200);
  if (consent) assert.strictEqual((await call('POST', '/api/consent', { optOut: false }, login.cookie)).status, 200);
  return login.cookie;
}
// Plays `months` months the way a careful player would, through the API.
async function play(cookie, gameId, startState, startSeq, months) {
  let state = startState, seq = startSeq, results = [];
  const send = async (command) => {
    const r = await call('POST', `/api/games/${gameId}/commands`, { seq: seq + 1, command }, cookie);
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    seq++; state = r.json.state; results.push(command); return r.json;
  };
  for (let m = 0; m < months && !state.over; m++) {
    for (let c; (c = state.queue.find((x) => !x.done));) {
      const opts = c.opts.filter((o) => !(o.cash && state.cash < o.cash));
      local.S = state;                                    // the bot's helpers read the engine's current state
      let k = oracle(c, local, false); if (!opts.some((o) => o.k === k)) k = opts[0].k;
      await send({ type: 'resolve', id: c.id, k });
    }
    await send({ type: 'closeMonth' });
  }
  return { state, seq, commands: results };
}

// --- database ----------------------------------------------------------------
test('schema: migrations are applied once and the journal refuses an unbalanced entry', async () => {
  assert.deepStrictEqual(await migrate(pool), []);                                  // second run does nothing
  const key = (await pool.query('SELECT gen_random_uuid() AS k')).rows[0].k;
  const g = (await pool.query("INSERT INTO bank.game (player_key, seed, engine_version) VALUES ($1, 1, 2) RETURNING id", [key])).rows[0].id;
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query("INSERT INTO bank.journal_entry (game_id, seq, command_seq, year, month, memo) VALUES ($1, 1, 1, 2027, 0, 'bad')", [g]);
    await c.query("INSERT INTO bank.journal_line VALUES ($1, 1, 1, 'cash', 100), ($1, 1, 2, 'deposits', -99)", [g]);
    await assert.rejects(c.query('COMMIT'), /does not balance/);
  } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); }
  const ok = await pool.connect();
  try {
    await ok.query('BEGIN');
    await ok.query("INSERT INTO bank.journal_entry (game_id, seq, command_seq, year, month, memo) VALUES ($1, 1, 1, 2027, 0, 'good')", [g]);
    await ok.query("INSERT INTO bank.journal_line VALUES ($1, 1, 1, 'cash', 100), ($1, 1, 2, 'deposits', -100)", [g]);
    await ok.query('COMMIT');
    await assert.rejects(pool.query("UPDATE bank.journal_line SET amount_pence = 5 WHERE game_id = $1", [g]), /append-only/);
  } finally { ok.release(); }
  await pool.query('DELETE FROM bank.game WHERE id = $1', [g]);
});

// --- accounts ----------------------------------------------------------------
test('accounts: register, confirm, sign in; passwords are Argon2id; sign-up does not reveal existing addresses', async () => {
  const email = 'ann@example.com';
  const r1 = await call('POST', '/api/register', { email, password: PW });
  const r2 = await call('POST', '/api/register', { email, password: PW });
  assert.strictEqual(r1.status, 202); assert.strictEqual(r2.status, 202);
  assert.deepStrictEqual(r1.json, r2.json);
  const row = (await pool.query('SELECT password_hash FROM account.player WHERE email = $1', [email])).rows[0];
  assert(row.password_hash.startsWith('$argon2id$'), 'hash should be Argon2id'); assert(!row.password_hash.includes(PW));

  let login = await call('POST', '/api/login', { email, password: PW });
  assert.strictEqual(login.status, 403); assert.strictEqual(login.json.error, 'email_not_confirmed');
  const mails = (await pool.query("SELECT body FROM account.outbox WHERE recipient = $1 AND subject LIKE 'Confirm%'", [email])).rows;
  const token = mails[0].body.match(/token=([\w-]+)/)[1];
  assert.strictEqual((await call('GET', '/api/confirm?token=' + token)).status, 302);
  assert.strictEqual((await call('GET', '/api/confirm?token=' + token)).status, 400);        // single use
  login = await call('POST', '/api/login', { email, password: PW });
  assert.strictEqual(login.status, 200);
  assert(/HttpOnly/i.test(String(login.res.headers['set-cookie'])) && /SameSite=Lax/i.test(String(login.res.headers['set-cookie'])));
  const me = await call('GET', '/api/me', null, login.cookie);
  assert.strictEqual(me.json.signedIn, true); assert.strictEqual(me.json.email, email); assert.strictEqual(me.json.consented, false);
  assert.strictEqual((await call('GET', '/api/me')).json.signedIn, false);
  assert.strictEqual((await call('POST', '/api/logout', {}, login.cookie)).status, 200);
  assert.strictEqual((await call('GET', '/api/me', null, login.cookie)).json.signedIn, false);
});

test('accounts: weak passwords and bad addresses are refused; failed sign-ins are rate limited', async () => {
  assert.strictEqual((await call('POST', '/api/register', { email: 'x@example.com', password: 'short' })).json.error, 'weak_password');
  assert.strictEqual((await call('POST', '/api/register', { email: 'nope', password: PW })).json.error, 'bad_email');
  await newPlayer('bob@example.com', { consent: false });
  for (let i = 0; i < 3; i++) assert.strictEqual((await call('POST', '/api/login', { email: 'bob@example.com', password: 'wrong wrong wrong' })).status, 401);
  assert.strictEqual((await call('POST', '/api/login', { email: 'bob@example.com', password: 'wrong wrong wrong' })).status, 429);
  assert.strictEqual((await call('POST', '/api/login', { email: 'bob@example.com', password: PW })).status, 429);   // even the right one, until the window passes
  await pool.query("DELETE FROM account.login_attempt WHERE lower(email) = 'bob@example.com'");
});

test('accounts: password reset works once, expires, and signs out other sessions', async () => {
  const email = 'cy@example.com';
  const cookie = await newPlayer(email, { consent: false });
  await call('POST', '/api/forgot', { email });
  await call('POST', '/api/forgot', { email: 'nobody@example.com' });                      // same answer, no mail
  assert.strictEqual((await pool.query("SELECT count(*)::int n FROM account.outbox WHERE recipient = 'nobody@example.com'")).rows[0].n, 0);
  const token = (await lastMail(email)).match(/reset=([\w-]+)/)[1];
  assert.strictEqual((await call('POST', '/api/reset', { token, password: 'a brand new password' })).status, 200);
  assert.strictEqual((await call('POST', '/api/reset', { token, password: 'another new password' })).status, 400);
  assert.strictEqual((await call('GET', '/api/me', null, cookie)).json.signedIn, false);
  assert.strictEqual((await call('POST', '/api/login', { email, password: 'a brand new password' })).status, 200);
  await call('POST', '/api/forgot', { email });
  const t2 = (await lastMail(email)).match(/reset=([\w-]+)/)[1];
  await pool.query("UPDATE account.token SET expires_at = now() - interval '1 minute'");
  assert.strictEqual((await call('POST', '/api/reset', { token: t2, password: 'yet another password' })).status, 400);
});

// --- games -------------------------------------------------------------------
test('games: signed-out and unconsented players cannot start a game', async () => {
  assert.strictEqual((await call('POST', '/api/games', {})).status, 401);
  const cookie = await newPlayer('dee@example.com', { consent: false });
  const r = await call('POST', '/api/games', {}, cookie);
  assert.strictEqual(r.status, 409); assert.strictEqual(r.json.error, 'consent_required');
});

test('games: a year played through the API is recorded, balances to zero and replays exactly', async () => {
  const cookie = await newPlayer('eve@example.com');
  const g = await call('POST', '/api/games', {}, cookie);
  assert.strictEqual(g.status, 201);
  const played = await play(cookie, g.json.id, g.json.state, 1, 12);
  assert.strictEqual(played.state.over, 'done');

  // the page's own engine, fed the same seed and commands, agrees with the server
  local.dispatch({ type: 'newGame', seed: g.json.seed });
  for (const c of played.commands) local.dispatch(c);
  const canon = (v) => JSON.stringify(JSON.parse(JSON.stringify(v)), (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, y) => (o[y] = x[y], o), {}) : x));
  { const diffs = []; const d = (x, y, p) => { if (diffs.length > 5) return; if (typeof x !== 'object' || x === null || typeof y !== 'object' || y === null) { if (x !== y) diffs.push(p + ': ' + JSON.stringify(x) + ' vs ' + JSON.stringify(y)); return; } for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) d(x[k], y[k], p + '.' + k); };
    d(JSON.parse(JSON.stringify(local.S)), played.state, 'S'); assert.deepStrictEqual(diffs, [], 'page engine and server state differ'); }
  assert.strictEqual(canon(local.S), canon(played.state));

  const id = g.json.id;
  const q = async (sql) => (await pool.query(sql, [id])).rows;
  assert.strictEqual((await q("SELECT status FROM bank.game WHERE id = $1"))[0].status, 'finished');
  assert.strictEqual((await q("SELECT count(*)::int n FROM bank.command WHERE game_id = $1"))[0].n, played.seq);
  assert.strictEqual((await q("SELECT count(*)::int n FROM bank.regulatory_snapshot WHERE game_id = $1"))[0].n, 12);
  assert.strictEqual((await q("SELECT count(*)::int n FROM bank.position_snapshot WHERE game_id = $1"))[0].n > 12 * 8, true);
  assert.strictEqual((await q("SELECT count(*)::int n FROM bank.event WHERE game_id = $1"))[0].n > 12, true);
  const dec = await q("SELECT kind, options, chosen, truth FROM bank.decision WHERE game_id = $1 LIMIT 1");
  assert(dec[0].options.length >= 2 && dec[0].chosen && Object.keys(dec[0].truth).length > 0, 'decision keeps the options and the hidden truth');
  assert.strictEqual(Number((await q("SELECT COALESCE(SUM(amount_pence), 0)::bigint s FROM bank.journal_line WHERE game_id = $1"))[0].s), 0);
  const ledger = (await call('GET', `/api/games/${id}/ledger`, null, cookie)).json;
  assert.strictEqual(ledger.trialBalancePence, 0); assert(ledger.accounts.length >= 8);
  // the journal agrees with the engine: stored cash balance equals the state's cash to the penny
  const cash = ledger.accounts.find((a) => a.account === 'cash').pence;
  assert(Math.abs(cash - Math.round(played.state.cash * 1e5)) <= 12, `ledger cash ${cash} vs state ${played.state.cash * 1e5}`);

  const v = await verifyGame(pool, host, id);
  assert.deepStrictEqual(v.problems, []); assert.strictEqual(v.ok, true);

  // tampering is detected: change one stored command and the replay no longer matches
  const target = (await pool.query("SELECT seq, payload FROM bank.command WHERE game_id = $1 AND type = 'resolve' AND seq > 5 LIMIT 1", [id])).rows[0];
  const opts = (await pool.query('SELECT options FROM bank.decision WHERE game_id = $1 AND command_seq = $2', [id, target.seq])).rows[0].options.map((o) => o.k);
  const other = opts.find((k) => k !== target.payload.k);
  await pool.query("UPDATE bank.command SET payload = jsonb_set(payload, '{k}', to_jsonb($3::text)) WHERE game_id = $1 AND seq = $2", [id, target.seq, other]);
  assert.strictEqual((await verifyGame(pool, host, id)).ok, false);
  await pool.query("UPDATE bank.command SET payload = $3::jsonb WHERE game_id = $1 AND seq = $2", [id, target.seq, JSON.stringify(target.payload)]);
  assert.strictEqual((await verifyGame(pool, host, id)).ok, true);

  // resuming: a fresh read of the game returns the latest state
  const got = (await call('GET', `/api/games/${id}`, null, cookie)).json;
  assert.strictEqual(got.seq, played.seq); assert.strictEqual(canon(got.state), canon(played.state));
  assert.strictEqual((await call('GET', '/api/games', null, cookie)).json.games.length, 1);

  // next year continues the same game and the same ledger
  const ny = await call('POST', `/api/games/${id}/commands`, { seq: played.seq + 1, command: { type: 'nextYear' } }, cookie);
  assert.strictEqual(ny.status, 200); assert.strictEqual(ny.json.state.year, 2028);
  assert.strictEqual((await verifyGame(pool, host, id)).ok, true);
});

test('games: bad, repeated, out-of-order and foreign commands are refused and change nothing', async () => {
  const cookie = await newPlayer('fay@example.com'), other = await newPlayer('gus@example.com');
  const g = (await call('POST', '/api/games', {}, cookie)).json, id = g.id;
  const card = g.state.queue[0];
  const post = (body, ck = cookie) => call('POST', `/api/games/${id}/commands`, body, ck);

  assert.strictEqual((await post({ seq: 5, command: { type: 'closeMonth' } })).status, 409);                         // gap
  assert.strictEqual((await post({ seq: 2, command: { type: 'newGame', seed: 1 } })).json.error, 'bad_command');   // cannot restart
  assert.strictEqual((await post({ seq: 2, command: { type: 'explode' } })).json.error, 'bad_command');
  assert.strictEqual((await post({ seq: 2, command: { type: 'resolve', id: 99999, k: 'x' } })).json.error, 'no_such_card');
  assert.strictEqual((await post({ seq: 2, command: { type: 'resolve', id: card.id, k: 'nope' } })).json.error, 'no_such_option');
  assert.strictEqual((await post({ seq: 2, command: { type: 'nextYear' } })).json.error, 'year_not_finished');
  assert.strictEqual((await post({ command: { type: 'closeMonth' } })).json.error, 'bad_command');
  const ok = await post({ seq: 2, command: { type: 'resolve', id: card.id, k: card.opts[0].k } });
  assert.strictEqual(ok.status, 200);
  const dup = await post({ seq: 2, command: { type: 'resolve', id: card.id, k: card.opts[0].k } });                 // a retried request
  assert.strictEqual(dup.status, 409); assert.strictEqual(dup.json.expected, 3);
  assert.strictEqual((await post({ seq: 3, command: { type: 'resolve', id: card.id, k: card.opts[0].k } })).json.error, 'already_resolved');
  assert.strictEqual((await post({ seq: 3, command: { type: 'closeMonth' } }, other)).status, 404);                 // someone else's game
  assert.strictEqual((await call('GET', `/api/games/${id}`, null, other)).status, 404);
  assert.strictEqual((await call('GET', `/api/games/${id}/ledger`, null, other)).status, 404);
  assert.strictEqual((await call('DELETE', `/api/games/${id}`, null, other)).status, 404);
  assert.strictEqual((await pool.query('SELECT last_seq FROM bank.game WHERE id = $1', [id])).rows[0].last_seq, 2);   // only the good command landed
  assert.strictEqual((await verifyGame(pool, host, id)).ok, true);
});

test('games: scenarios and the tutorial start, and a failed transaction leaves no half-written command', async () => {
  const cookie = await newPlayer('hal@example.com');
  const keys = Object.keys(local.SCENARIOS);
  const s = await call('POST', '/api/games', { scenario: keys[0] }, cookie);
  assert.strictEqual(s.status, 201); assert.strictEqual(s.json.state.scenario, keys[0]);
  assert.strictEqual((await verifyGame(pool, host, s.json.id)).ok, true);
  const t = await call('POST', '/api/games', { tutorial: true }, cookie);
  assert.strictEqual(t.status, 201); assert.strictEqual(t.json.state.tutorial, true);
  assert.strictEqual((await call('POST', '/api/games', { scenario: 'not-a-scenario' }, cookie)).status, 422);
  // if the database fails part-way through a command, the whole command is rolled back: no command, no state change
  const id = t.json.id, card = t.json.state.queue[0];
  const count = async (tbl) => (await pool.query(`SELECT count(*)::int n FROM bank.${tbl} WHERE game_id = $1`, [id])).rows[0].n;
  const before = { command: await count('command'), entry: await count('journal_entry'), decision: await count('decision') };
  await pool.query(`CREATE FUNCTION bank.boom() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'boom'; END $$`);
  await pool.query('CREATE TRIGGER boom BEFORE INSERT ON bank.decision FOR EACH ROW EXECUTE FUNCTION bank.boom()');
  try {
    const bad = await call('POST', `/api/games/${id}/commands`, { seq: 2, command: { type: 'resolve', id: card.id, k: card.opts[0].k } }, cookie);
    assert.strictEqual(bad.status, 500);
  } finally {
    await pool.query('DROP TRIGGER boom ON bank.decision'); await pool.query('DROP FUNCTION bank.boom()');
  }
  assert.deepStrictEqual({ command: await count('command'), entry: await count('journal_entry'), decision: await count('decision') }, before);
  assert.strictEqual((await pool.query('SELECT last_seq FROM bank.game WHERE id = $1', [id])).rows[0].last_seq, 1);
  const retry = await call('POST', `/api/games/${id}/commands`, { seq: 2, command: { type: 'resolve', id: card.id, k: card.opts[0].k } }, cookie);
  assert.strictEqual(retry.status, 200);                                  // the same request now succeeds, with the same sequence number
  assert.strictEqual((await verifyGame(pool, host, id)).ok, true);
});

test('players: opting out of analysis is recorded on the game; deleting a player removes everything', async () => {
  const email = 'ivy@example.com';
  assert.strictEqual((await call('POST', '/api/register', { email, password: PW })).status, 202);
  await call('GET', '/api/confirm?token=' + (await lastMail(email)).match(/token=([\w-]+)/)[1]);
  const cookie = (await call('POST', '/api/login', { email, password: PW })).cookie;
  await call('POST', '/api/consent', { optOut: true }, cookie);
  const g = (await call('POST', '/api/games', {}, cookie)).json;
  assert.strictEqual((await pool.query('SELECT in_analysis, synthetic FROM bank.game WHERE id = $1', [g.id])).rows[0].in_analysis, false);
  const col = (await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'bank' AND table_name <> 'gl_account' AND column_name IN ('email', 'name', 'password_hash')")).rows;
  assert.deepStrictEqual(col, [], 'the bank schema never holds an email, name or password');
  assert.strictEqual((await call('DELETE', '/api/me', { password: 'wrong wrong wrong' }, cookie)).status, 401);
  assert.strictEqual((await call('DELETE', '/api/me', { password: PW }, cookie)).status, 200);
  assert.strictEqual((await pool.query('SELECT count(*)::int n FROM bank.game WHERE id = $1', [g.id])).rows[0].n, 0);
  for (const t of ['command', 'game_state', 'journal_entry', 'journal_line', 'decision', 'event'])
    assert.strictEqual((await pool.query(`SELECT count(*)::int n FROM bank.${t} WHERE game_id = $1`, [g.id])).rows[0].n, 0, t);
  assert.strictEqual((await pool.query('SELECT count(*)::int n FROM account.player WHERE email = $1', [email])).rows[0].n, 0);
});

test('web: the page is served, health check works, and form posts are refused', async () => {
  const page = await app.inject({ method: 'GET', url: '/' });
  assert.strictEqual(page.statusCode, 200); assert(page.body.includes('Counting House'));
  assert.strictEqual((await call('GET', '/healthz')).json.ok, true);
  const form = await app.inject({ method: 'POST', url: '/api/login', payload: 'email=a&password=b', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  assert.strictEqual(form.statusCode, 415);
});
