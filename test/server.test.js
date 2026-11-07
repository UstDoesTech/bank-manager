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
  // the journal agrees with the engine to within the pence lost rounding each line (about half a penny per line, a few hundred lines a year)
  const cash = ledger.accounts.find((a) => a.account === 'cash').pence;
  assert(Math.abs(cash - Math.round(played.state.cash * 1e5)) <= 60, `ledger cash ${cash} vs state ${played.state.cash * 1e5}`);

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

test('portfolio: borrowers, agreements, collateral and month-end cohorts are recorded and agree with the ledger', async () => {
  const cookie = await newPlayer('pia@example.com');
  const g = await call('POST', '/api/games', {}, cookie);
  const played = await play(cookie, g.json.id, g.json.state, 1, 12);
  const id = g.json.id, q = async (sql) => (await pool.query(sql, [id])).rows;
  const loans = played.state.loans;
  assert(loans.length > 5, 'the careful bot should have made loans');

  const open = await q("SELECT * FROM bank.agreement WHERE game_id = $1 AND status <> 'closed'");
  assert.strictEqual(open.length, loans.length);
  assert.strictEqual((await q('SELECT count(*)::int n FROM bank.party WHERE game_id = $1'))[0].n, (await q('SELECT count(*)::int n FROM bank.agreement WHERE game_id = $1'))[0].n);
  const mortgages = (await q("SELECT count(*)::int n FROM bank.collateral WHERE game_id = $1"))[0].n;
  assert.strictEqual(mortgages, (await q("SELECT count(*)::int n FROM bank.agreement WHERE game_id = $1 AND product = 'mortgage'"))[0].n);

  // the last month's cohorts add up to the loans account in the journal (a few pence of rounding per loan allowed)
  const last = (await q('SELECT max(month) m FROM bank.portfolio_cohort WHERE game_id = $1'))[0].m;
  const book = Number((await q(`SELECT COALESCE(SUM(balance_pence), 0)::bigint s FROM bank.portfolio_cohort WHERE game_id = $1 AND month = ${last}`))[0].s);
  const ledgerLoans = Number((await q("SELECT COALESCE(SUM(amount_pence), 0)::bigint s FROM bank.journal_line WHERE game_id = $1 AND account = 'loans'"))[0].s);
  assert(Math.abs(book - ledgerLoans) <= 50 + 3 * loans.length, `cohorts ${book} vs ledger ${ledgerLoans}`);
  assert((await q('SELECT count(*)::int n FROM bank.portfolio_cohort WHERE game_id = $1'))[0].n > 12);

  // closed agreements carry an outcome, and the replay checks the loan tables
  for (const r of await q("SELECT outcome, closed_year FROM bank.agreement WHERE game_id = $1 AND status = 'closed'")) assert(r.outcome && r.closed_year);
  assert.strictEqual((await verifyGame(pool, host, id)).ok, true);

  // an edited balance is caught by the replay
  await pool.query("UPDATE bank.agreement SET balance_pence = balance_pence + 100 WHERE game_id = $1 AND agreement_id = $2", [id, open[0].agreement_id]);
  assert.strictEqual((await verifyGame(pool, host, id)).ok, false);
});

test('policy: every game starts on the system pricing and credit policy and cannot change it until it is unlocked', async () => {
  const cookie = await newPlayer('rex@example.com');
  const g = (await call('POST', '/api/games', {}, cookie)).json;
  assert.deepStrictEqual(g.state.policy.owner, { pricing: 'system', credit: 'system', treasury: 'system', funding: 'system', capital: 'system' });
  assert.strictEqual(g.state.policy.pricing.cardRate, 24.9);
  const url = `/api/games/${g.id}/commands`;
  const r = await call('POST', url, { seq: 2, command: { type: 'setPolicy', area: 'pricing', values: { cardRate: 5 } } }, cookie);
  assert.strictEqual(r.status, 403); assert.strictEqual(r.json.error, 'not_unlocked');
  const bad = await call('POST', url, { seq: 2, command: { type: 'setPolicy', area: 'nope', values: {} } }, cookie);
  assert.strictEqual(bad.status, 400);
  assert.strictEqual((await pool.query('SELECT last_seq FROM bank.game WHERE id = $1', [g.id])).rows[0].last_seq, 1);
  assert.strictEqual((await call('GET', `/api/games/${g.id}`, null, cookie)).json.state.policy.pricing.cardRate, 24.9);
  // once an area is unlocked the server accepts taking it over and handing it back; the stored command keeps only what matters
  const { validate, cleanCommand } = require('../server/games');
  const open = { over: null, progress: { unlocked: ['branch', 'pricing', 'credit'] } };
  validate(open, { type: 'setPolicy', area: 'credit', values: { mortgageMaxLtv: 80 } });
  validate(open, { type: 'setPolicy', area: 'credit', release: true });
  assert.throws(() => validate(open, { type: 'setPolicy', area: 'credit', values: [1] }), /Missing values/);
  assert.deepStrictEqual(cleanCommand({ type: 'setPolicy', area: 'credit', release: true, evil: 1 }), { type: 'setPolicy', area: 'credit', values: undefined, release: true });
});

test('ledger: every account the engine can post to is in the chart of accounts', async () => {
  const have = new Set((await pool.query('SELECT code FROM bank.gl_account')).rows.map((r) => r.code));
  const src = fs.readFileSync(path.join(__dirname, '..', 'engine', 'engine.js'), 'utf8');
  // accounts named in journal entries, plus one P&L account per line of the profit-and-loss statement
  const named = new Set([...src.matchAll(/\[\s*'((?:pl|equity)\.[A-Za-z]+|cash|gilts|legacy|loans|deposits|cb|wholesale|bonds|retained)'\s*,/g)].map((m) => m[1]));
  const pl = [...src.matchAll(/function blankPL\(\)\{ return \{([^}]*)\}/g)][0][1].split(',').map((s) => 'pl.' + s.split(':')[0].trim());
  for (const a of [...named, ...pl]) assert(have.has(a), 'missing from the chart of accounts: ' + a);
  assert(have.has('wholesale') && have.has('equity.dividend'));
});

test('households: a game started with them records the cast and each month, and the replay agrees', async () => {
  const cookie = await newPlayer('kit@example.com');
  const g = await call('POST', '/api/games', { households: true }, cookie);
  assert.strictEqual(g.status, 201); assert.strictEqual(g.json.state.households.length, 7);
  const played = await play(cookie, g.json.id, g.json.state, 1, 4);
  const id = g.json.id, q = async (sql) => (await pool.query(sql, [id])).rows;
  assert.strictEqual((await q('SELECT count(*)::int n FROM bank.household WHERE game_id = $1'))[0].n, 7);
  assert.strictEqual((await q('SELECT count(*)::int n FROM bank.household_month WHERE game_id = $1'))[0].n, 7 * 4);
  const cast = played.state.households, row = (await q("SELECT * FROM bank.household_month WHERE game_id = $1 AND household_id = 3 ORDER BY year, month DESC LIMIT 1"))[0];
  assert.strictEqual(row.credit_score, cast.find((h) => h.id === 3).hist.at(-1).score);
  assert.strictEqual((await verifyGame(pool, host, id)).ok, true);
  await pool.query('UPDATE bank.household_month SET credit_score = credit_score + 1 WHERE game_id = $1 AND household_id = 3 AND year = $2 AND month = $3', [id, row.year, row.month]);
  assert.strictEqual((await verifyGame(pool, host, id)).ok, false, 'an edited score is caught');
  // tutorials and scenarios never get a cast, whatever the request says
  const tut = await call('POST', '/api/games', { households: true, tutorial: true }, cookie);
  assert.strictEqual(tut.json.state.households, undefined);
});

test('literacy: five questions before the first game and one more after each year, scored on the server', async () => {
  const { QUESTIONS } = require('../server/literacy');
  assert.strictEqual((await call('GET', '/api/literacy')).status, 401);
  const noConsent = await newPlayer('lou@example.com', { consent: false });
  assert.strictEqual((await call('POST', '/api/literacy', { answers: {} }, noConsent)).status, 409);

  const cookie = await newPlayer('mia@example.com');
  const first = (await call('GET', '/api/literacy', null, cookie)).json;
  assert.strictEqual(first.due, true); assert.strictEqual(first.phase, 'before'); assert.strictEqual(first.questions.length, 5);
  assert(!JSON.stringify(first).match(/"answer"|"why"/), 'the page is never sent the answer key');
  const right = Object.fromEntries(QUESTIONS.map((q) => [q.id, q.answer])), wrong = Object.fromEntries(QUESTIONS.map((q) => [q.id, q.options.find((o) => o.k !== q.answer && o.k !== 'dk').k]));
  assert.strictEqual((await call('POST', '/api/literacy', { answers: { interest: 'a' } }, cookie)).status, 400);
  assert.strictEqual((await call('POST', '/api/literacy', { answers: { ...right, bonds: 'zzz' } }, cookie)).status, 400);
  const r1 = await call('POST', '/api/literacy', { answers: { ...wrong, interest: 'dk' } }, cookie);
  assert.strictEqual(r1.status, 201); assert.strictEqual(r1.json.score, 0); assert.strictEqual(r1.json.phase, 'before'); assert(r1.json.results.every((x) => x.why && x.correct === false));
  assert.strictEqual((await call('GET', '/api/literacy', null, cookie)).json.due, false, 'nothing is due until a year is played');
  assert.strictEqual((await call('POST', '/api/literacy', { answers: right }, cookie)).status, 409, 'cannot take it twice for the same point');

  // play a year; one more check is then due, and it can be tied to the game
  const g = (await call('POST', '/api/games', {}, cookie)).json;
  const played = await play(cookie, g.id, g.state, 1, 12);
  assert.strictEqual(played.state.over, 'done');
  const due = (await call('GET', '/api/literacy', null, cookie)).json;
  assert.strictEqual(due.due, true); assert.strictEqual(due.phase, 'after'); assert.strictEqual(due.yearsPlayed, 1); assert.strictEqual(due.attempt, 2);
  assert.strictEqual((await call('POST', '/api/literacy', { answers: right, gameId: '00000000-0000-0000-0000-000000000000' }, cookie)).status, 404);
  const r2 = await call('POST', '/api/literacy', { answers: right, gameId: g.id }, cookie);
  assert.strictEqual(r2.status, 201); assert.strictEqual(r2.json.score, 5); assert.strictEqual(r2.json.phase, 'after');
  assert.strictEqual((await call('GET', '/api/literacy', null, cookie)).json.due, false);

  // the analysis views see the change from 0 to 5 and the per-question results
  const prog = (await pool.query('SELECT first_score, latest_score, change, years_played FROM bank.literacy_progress')).rows;
  assert.strictEqual(prog.length, 1); assert.deepStrictEqual(prog[0], { first_score: 0, latest_score: 5, change: 5, years_played: 1 });
  const byC = (await pool.query("SELECT phase, share_correct FROM bank.literacy_by_concept WHERE question = 'bonds' ORDER BY phase")).rows;
  assert.deepStrictEqual(byC.map((r) => [r.phase, Number(r.share_correct)]), [['after', 1], ['before', 0]]);
  assert((await pool.query('SELECT decisions FROM bank.literacy_with_play WHERE attempt = 2')).rows[0].decisions > 5);

  // a player who keeps games out of analysis is left out of the views, and deleting the player removes the checks
  const quiet = await newPlayer('nat@example.com', { consent: false });
  await call('POST', '/api/consent', { optOut: true }, quiet);
  assert.strictEqual((await call('POST', '/api/literacy', { answers: right }, quiet)).status, 201);
  assert.strictEqual((await pool.query('SELECT count(*)::int n FROM bank.literacy_check')).rows[0].n, 3);
  assert.strictEqual((await pool.query("SELECT count(*)::int n FROM bank.literacy_by_concept WHERE phase = 'before'")).rows[0].n, 5, 'only the first player appears');
  assert.strictEqual((await call('DELETE', '/api/me', { password: PW }, cookie)).status, 200);
  assert.strictEqual((await pool.query('SELECT count(*)::int n FROM bank.literacy_check')).rows[0].n, 1);
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
  const col = (await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'bank' AND table_name NOT IN ('gl_account', 'party', 'household') AND column_name IN ('email', 'name', 'password_hash')")).rows;
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

test('literacy: every example analysis query runs', async () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'analysis', 'literacy.sql'), 'utf8');
  const queries = sql.split(';').map((q) => q.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean);
  assert(queries.length >= 5);
  for (const q of queries) await pool.query(q);
});

test('guests: a game played without signing in is recorded under an opaque key and claimed by registering; guests cannot delete', async () => {
  const g1 = await call('POST', '/api/guest', {});
  assert.strictEqual(g1.status, 201); assert(g1.cookie && /bm_session/.test(g1.cookie));
  assert(/Max-Age=31/.test(String(g1.res.headers['set-cookie'])), 'a guest cookie lasts a year, not two weeks');
  const me = (await call('GET', '/api/me', null, g1.cookie)).json;
  assert.strictEqual(me.signedIn, true); assert.strictEqual(me.guest, true); assert.strictEqual(me.email, null); assert.strictEqual(me.consented, true);
  assert.strictEqual((await call('POST', '/api/guest', {}, g1.cookie)).json.guest, true);        // asking again does not make a second player

  const game = await call('POST', '/api/games', { households: true }, g1.cookie);
  assert.strictEqual(game.status, 201);
  const played = await play(g1.cookie, game.json.id, game.json.state, 1, 3);
  assert((await verifyGame(pool, host, game.json.id)).ok);
  const key = (await pool.query('SELECT player_key FROM bank.game WHERE id = $1', [game.json.id])).rows[0].player_key;

  // registering keeps the same player and the games
  const email = 'claim-guest@example.com';
  assert.strictEqual((await call('POST', '/api/register', { email, password: PW }, g1.cookie)).status, 202);
  const row = (await pool.query('SELECT player_key, guest, email_confirmed_at FROM account.player WHERE lower(email) = $1', [email])).rows[0];
  assert.strictEqual(row.player_key, key); assert.strictEqual(row.guest, false); assert.strictEqual(row.email_confirmed_at, null);
  const token = (await lastMail(email)).match(/token=([\w-]+)/)[1];
  assert.strictEqual((await call('GET', '/api/confirm?token=' + token)).status, 302);
  const login = await call('POST', '/api/login', { email, password: PW });
  assert.strictEqual((await call('GET', '/api/games', null, login.cookie)).json.games.length, 1);
  await call('DELETE', '/api/me', { password: PW }, login.cookie);

  // a guest who registers an address that is already taken learns nothing and keeps playing as a guest
  const taken = 'taken-' + Date.now() + '@example.com';
  await newPlayer(taken);
  const g2 = await call('POST', '/api/guest', {});
  assert.strictEqual((await call('POST', '/api/register', { email: taken, password: PW }, g2.cookie)).status, 202);
  assert.strictEqual((await call('GET', '/api/me', null, g2.cookie)).json.guest, true);

  // a guest cannot delete their games
  const game2 = await call('POST', '/api/games', {}, g2.cookie);
  assert.strictEqual((await call('DELETE', '/api/me', {}, g2.cookie)).status, 403);
  assert.strictEqual((await call('DELETE', `/api/games/${game2.json.id}`, null, g2.cookie)).status, 403);
  assert.strictEqual((await pool.query('SELECT 1 FROM bank.game WHERE id = $1', [game2.json.id])).rows.length, 1);

  // an account cannot be made without an email and password except as a guest
  await assert.rejects(pool.query('INSERT INTO account.player (guest) VALUES (false)'), /player_guest_or_account/);
});

test('chief executive: policy and stress commands are recorded with their details and the replay agrees', async () => {
  const cookie = await newPlayer('ceo@example.com');
  const plain = (await call('POST', '/api/games', {}, cookie)).json;
  const no = await call('POST', `/api/games/${plain.id}/commands`, { seq: 2, command: { type: 'stress' } }, cookie);
  assert.strictEqual(no.status, 403); assert.strictEqual(no.json.error, 'not_unlocked');
  const g = (await call('POST', '/api/games', { chiefExecutive: true }, cookie)).json;
  assert.deepStrictEqual(g.state.progress.unlocked, ['branch', 'pricing', 'credit', 'treasury', 'funding', 'capital']);
  const url = `/api/games/${g.id}/commands`; let seq = 1;
  const send = (command) => call('POST', url, { seq: ++seq, command }, cookie);
  assert.strictEqual((await send({ type: 'setPolicy', area: 'credit', values: { mortgageMaxLtv: 80 } })).status, 200);
  const st = await send({ type: 'stress', overrides: { credit: { mortgageMaxLtv: 70 } } });
  assert.strictEqual(st.status, 200); assert(st.json.state.stress && st.json.state.stress.custom === true && st.json.state.stress.lowCap > 0);
  assert.strictEqual(st.json.state.policy.credit.mortgageMaxLtv, 80, 'the stress test did not change the saved settings');
  assert.strictEqual((await send({ type: 'stress', overrides: { credit: { mortgageMaxLtv: 500 } } })).status >= 400, true); seq--;       // refused, so the sequence number is not used
  const stored = (await pool.query("SELECT payload FROM bank.command WHERE game_id = $1 AND type IN ('setPolicy','stress') ORDER BY seq", [g.id])).rows.map((r) => r.payload);
  assert.deepStrictEqual(stored, [{ type: 'setPolicy', area: 'credit', values: { mortgageMaxLtv: 80 } }, { type: 'stress', overrides: { credit: { mortgageMaxLtv: 70 } } }]);
  const played = await play(cookie, g.id, st.json.state, seq, 3);
  assert(played.state.month >= 3);
  const v = await verifyGame(pool, host, g.id);
  assert.deepStrictEqual(v.problems, []); assert.strictEqual(v.ok, true);
  // resigning ends the game as finished, is replayed, and nothing more is accepted
  const rs = await call('POST', url, { seq: played.seq + 1, command: { type: 'resign' } }, cookie);
  assert.strictEqual(rs.status, 200); assert.strictEqual(rs.json.state.over, 'resigned');
  assert.strictEqual((await pool.query('SELECT status FROM bank.game WHERE id = $1', [g.id])).rows[0].status, 'finished');
  assert.strictEqual((await call('POST', url, { seq: played.seq + 2, command: { type: 'closeMonth' } }, cookie)).status, 409);
  assert.strictEqual((await verifyGame(pool, host, g.id)).ok, true);
  assert.strictEqual((await call('POST', `/api/games/${plain.id}/commands`, { seq: 2, command: { type: 'resign' } }, cookie)).json.error, 'not_unlocked');
  const { validate } = require('../server/games');
  assert.throws(() => validate({ over: null, progress: { unlocked: ['branch'] } }, { type: 'stress' }), /Chief Executive/);
  assert.throws(() => validate({ over: 'done', progress: { unlocked: ['branch', 'pricing'] } }, { type: 'stress' }), /year is over/);
});
