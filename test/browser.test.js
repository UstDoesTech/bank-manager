'use strict';
// Drives the real page in Edge against the real server and database.   docker compose up -d db && npm run test:browser
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { Pool } = require('pg');
const { chromium } = require('playwright-core');
const { build, migrate } = require('../server/app');
const { createPool } = require('../server/db');
const { verifyGame } = require('../server/replay');

const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
const ADMIN = process.env.DATABASE_ADMIN_URL || 'postgres://bank:bank@localhost:5432/postgres';
const TEST_DB = 'bank_browser_' + process.pid;
const cfg = { baseUrl: '', sessionDays: 1, maxFailedLogins: 5, failedLoginWindowMinutes: 15, confirmHours: 48, resetHours: 1 };
const PW = 'a long enough password';

let admin, pool, app, host, browser, base;

before(async () => {
  if (!EDGE) return;
  admin = new Pool({ connectionString: ADMIN });
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  pool = createPool(ADMIN.replace(/\/[^/]*$/, '/' + TEST_DB));
  await migrate(pool);
  ({ app, host } = await build({ pool, cfg, logger: false }));
  await app.listen({ port: 0, host: '127.0.0.1' });
  base = 'http://127.0.0.1:' + app.server.address().port;
  cfg.baseUrl = base;
  browser = await chromium.launch({ executablePath: EDGE, headless: true });
});
after(async () => {
  if (browser) await browser.close();
  if (app) await app.close();
  if (pool) await pool.end();
  if (admin) { await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`); await admin.end(); }
});

const waitFor = async (fn, what, ms = 8000) => {
  const end = Date.now() + ms; let v;
  while (Date.now() < end) { v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 100)); }
  assert.fail('timed out waiting for ' + what);
};

test('the page: sign up, confirm, accept the notice, play online and offline, and the server replays it exactly', { skip: !EDGE && 'no Edge/Chrome found' }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 860 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/');
  await page.waitForSelector('#ovAcct');
  assert.match(await page.textContent('#ovAcct'), /Sign in to save/);

  // create the account through the form
  await page.click('#ovAcct');
  await page.fill('#acEmail', 'pat@example.com'); await page.fill('#acPw', PW);
  await page.click('#acReg');
  await waitFor(async () => /Check your email/.test(await page.textContent('.acct .msg')), 'registration message');
  const mail = (await pool.query("SELECT body FROM account.outbox WHERE recipient = 'pat@example.com'")).rows[0].body;
  const token = mail.match(/token=([\w-]+)/)[1];

  // the emailed link confirms the address and returns to the page
  await page.goto(base + '/api/confirm?token=' + token);
  await waitFor(async () => /Email confirmed/.test(await page.textContent('.acct .msg').catch(() => '')), 'confirmation message');
  await page.fill('#acEmail', 'pat@example.com'); await page.fill('#acPw', PW);
  await page.click('#acIn');

  // first sign-in shows the recording notice; a game cannot be recorded until it is accepted
  await page.waitForSelector('#acOk');
  assert.match(await page.textContent('.panel'), /What gets recorded/);
  await page.click('#acOk');
  await waitFor(async () => /Recording is on/.test(await page.textContent('.acct .msg')), 'consent message');
  await page.click('#acBack');
  await waitFor(async () => /Recording as pat@example.com/.test(await page.textContent('#ovAcct')), 'signed-in title');

  // a new game: the five-question check comes first (optional), then the server hands out the seed and the page plays on its own engine
  await page.click('#ovNew');
  await page.waitForSelector('#lqGo');
  assert.match(await page.textContent('.panel'), /Five quick questions/);
  await page.click('#lqGo');
  assert.match(await page.textContent('#lqMsg'), /answer every question/);       // it will not submit half-answered
  for (const name of ['interest', 'inflation', 'diversification', 'mortgage', 'bonds']) await page.check('input[name=lq_' + name + '] >> nth=0');
  await page.click('#lqGo');
  await page.waitForSelector('#lqDone');
  assert.match(await page.textContent('.panel'), /You got \d of 5/);
  await page.click('#lqDone');
  await waitFor(async () => (await pool.query('SELECT 1 FROM bank.game')).rows.length === 1, 'game on the server');
  const gameId = (await pool.query('SELECT id FROM bank.game')).rows[0].id;
  const seed = (await pool.query('SELECT seed FROM bank.game WHERE id = $1', [gameId])).rows[0].seed;
  assert.strictEqual(await page.evaluate(() => S.seed), seed, 'the page uses the seed the server chose');

  const playMonth = () => page.evaluate(() => {
    for (let c; (c = current());){ const o = c.opts.filter((o) => !(o.cash && S.cash < o.cash)); dispatch({ type: 'resolve', id: c.id, k: o[0].k }); }
    closeBooks();
    return S.month;
  });
  const serverSeq = async () => (await pool.query('SELECT last_seq FROM bank.game WHERE id = $1', [gameId])).rows[0].last_seq;
  const pageCommands = () => page.evaluate(() => JSON.parse(localStorage.getItem('bm-remote') || '{}'));

  await playMonth(); await playMonth();
  await waitFor(async () => { const r = await pageCommands(); return r.pending && r.pending.length === 0 && (await serverSeq()) === r.seq && r.seq > 8; }, 'server to catch up');

  // the regular customers: seven households, a Customers panel, and each closed month stored on the server
  assert.strictEqual(await page.evaluate(() => S.households.length), 7);
  await waitFor(async () => !(await page.isHidden('#hhBtn')), 'Customers button');
  await page.evaluate(() => closeOverlay());
  await page.click('#hhBtn');
  assert.strictEqual(await page.locator('#ov .note').count(), 7);
  assert.match(await page.textContent('.panel'), /credit score \d+ \/ 999/);
  await page.click('#hhBack');


  // offline: play another month, nothing reaches the server, but nothing is lost
  const before = await serverSeq();
  await ctx.setOffline(true);
  await playMonth();
  await new Promise((r) => setTimeout(r, 500));
  assert.strictEqual(await serverSeq(), before, 'nothing is sent while offline');
  assert((await pageCommands()).pending.length > 0, 'unsent commands are kept');

  // reload while still offline, then come back online: the queue survives the reload and is flushed
  await ctx.setOffline(false);
  await page.reload();
  await waitFor(async () => { const r = await pageCommands(); return r.pending && r.pending.length === 0 && (await serverSeq()) > before; }, 'queued commands to flush after reload');

  // the server's own run of the commands agrees with what the page saw
  const v = await verifyGame(pool, host, gameId);
  assert.deepStrictEqual(v.problems, []);
  const row = (await pool.query('SELECT state FROM bank.game_state WHERE game_id = $1', [gameId])).rows[0].state;
  assert.strictEqual(row.month, 3);
  const ledger = (await pool.query("SELECT COALESCE(SUM(amount_pence), 0)::bigint s FROM bank.journal_line WHERE game_id = $1", [gameId])).rows[0].s;
  assert.strictEqual(Number(ledger), 0);
  assert.strictEqual((await pool.query('SELECT count(*)::int n FROM bank.regulatory_snapshot WHERE game_id = $1', [gameId])).rows[0].n, 3);

  assert.strictEqual((await pool.query('SELECT count(*)::int n FROM bank.household_month WHERE game_id = $1', [gameId])).rows[0].n, 7 * 3);
  assert.strictEqual((await pool.query('SELECT count(*)::int n FROM bank.literacy_check')).rows[0].n, 1);
  assert.deepStrictEqual(errors, [], 'no script errors in the page');
  await ctx.close();
});

test('the page works with no server: opened from a file there is no account button and games play as before', { skip: !EDGE && 'no Edge/Chrome found' }, async () => {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file:///' + require('path').resolve(__dirname, '..', 'Bank Manager.html').replace(/\\/g, '/'));
  await page.waitForSelector('#ovTrain');
  assert.strictEqual(await page.$('#ovAcct'), null);
  await page.click('#ovTrain');
  const ok = await page.evaluate(() => { for (let c; (c = current());) dispatch({ type: 'resolve', id: c.id, k: c.opts[0].k }); closeBooks(); return S.month; });
  assert.strictEqual(ok, 1);

  // a full year: the year-end screen has the note about default rates and the executive team's notes, which can be read and skipped
  await page.evaluate(() => { closeOverlay(); while (!S.over){ for (let c; (c = current());) dispatch({ type: 'resolve', id: c.id, k: c.opts[0].k }); dispatch({ type: 'closeMonth' }); } endScreen(); });
  assert.match(await page.textContent('.panel'), /about three times real-world levels/);
  await page.click('#ovDebrief');
  const notes = await page.locator('#ov .note').count();
  assert(notes >= 3 && notes <= 5, 'three to five notes: ' + notes);
  assert.match(await page.textContent('.panel'), /To think about/);
  await page.click('#dbBack');
  assert.match(await page.textContent('.panel'), /year-end rating/);
  assert.strictEqual(await page.$('#ovLit'), null, 'no check is offered when playing without an account');

  // the Policy button is hidden until the board hands pricing over; then the screen edits it and a bad value is refused
  assert.strictEqual(await page.isVisible('#policyBtn'), false);
  await page.evaluate(() => { S.progress.unlocked.push('pricing'); closeOverlay(); hud(); });
  assert.strictEqual(await page.isVisible('#policyBtn'), true);
  await page.click('#policyBtn');
  assert.match(await page.textContent('.panel'), /Not yet yours/);        // credit is still locked
  await page.fill('input[data-key=mortgageSpread]', '1.4'); await page.click('#plSave');
  await waitFor(async () => /Saved/.test(await page.textContent('.acct .msg')), 'policy saved');
  assert.strictEqual(await page.evaluate(() => S.policy.pricing.mortgageSpread), 1.4);
  assert.strictEqual(await page.evaluate(() => S.policy.owner.pricing), 'player');
  await page.fill('input[data-key=cardRate]', '90'); await page.click('#plSave');
  await waitFor(async () => /between/.test(await page.textContent('.acct .msg')), 'out-of-range refused');
  await page.click('#plReset');
  await waitFor(async () => /executive team's values/.test(await page.textContent('.acct .msg')), 'reset');
  assert.strictEqual(await page.evaluate(() => S.policy.pricing.mortgageSpread), 1.05);
  assert.deepStrictEqual(errors, []);
  await ctx.close();
});

test('the page without an account: the game is recorded anonymously, the player was told, and can switch it off', { skip: !EDGE && 'no Edge/Chrome found' }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 860 } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/');
  await page.waitForSelector('#ovTrain');
  assert.match(await page.textContent('.panel'), /recorded anonymously/);
  assert.strictEqual((await pool.query('SELECT count(*)::int n FROM account.player WHERE guest')).rows[0].n, 0, 'nobody is created just by opening the page');

  await page.click('#ovNew');
  await waitFor(async () => (await pool.query('SELECT count(*)::int n FROM bank.game g JOIN account.player p ON p.player_key = g.player_key WHERE p.guest')).rows[0].n === 1, 'guest game on the server');
  await page.evaluate(() => { closeOverlay(); for (let c; (c = current());) dispatch({ type: 'resolve', id: c.id, k: c.opts.find((o) => !(o.cash && S.cash < o.cash)).k }); closeBooks(); });
  const r = await waitFor(async () => { const x = await page.evaluate(() => JSON.parse(localStorage.getItem('bm-remote') || '{}')); return x.pending && x.pending.length === 0 && x.seq > 3 && x; }, 'commands to reach the server');
  const gameId = (await pool.query('SELECT g.id FROM bank.game g JOIN account.player p ON p.player_key = g.player_key WHERE p.guest')).rows[0].id;
  assert.deepStrictEqual((await verifyGame(pool, host, gameId)).problems, []);
  assert.strictEqual((await pool.query('SELECT count(*)::int n FROM bank.journal_line WHERE game_id = $1', [gameId])).rows[0].n > 0, true);

  // a returning visit uses the same guest; turning recording off on the title screen stops new games being recorded
  await page.reload(); await page.waitForSelector('#ovAcct');
  assert.match(await page.textContent('#ovAcct'), /guest/);
  await page.click('#ovAcct'); await page.click('summary'); await page.click('#acGuestDel');
  await page.waitForSelector('#ovRecOn');
  assert.strictEqual((await pool.query('SELECT count(*)::int n FROM bank.game WHERE id = $1', [gameId])).rows[0].n, 0, 'the guest games were deleted');
  await page.click('#ovNew');
  await page.waitForFunction(() => S && S.seed);
  await new Promise((res) => setTimeout(res, 500));
  assert.strictEqual((await pool.query('SELECT count(*)::int n FROM bank.game g JOIN account.player p ON p.player_key = g.player_key WHERE p.guest')).rows[0].n, 0, 'nothing is recorded once it is off');
  assert.deepStrictEqual(errors, []);
  await ctx.close();
});
