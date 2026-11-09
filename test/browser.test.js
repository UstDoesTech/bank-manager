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
  await page.waitForSelector('#acOut');            // signed in: there is no further notice or agreement
  assert.doesNotMatch(await page.textContent('.panel'), /What gets recorded|Start recording/);
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
  // the menu says the game is being recorded, and signing out takes two taps and stops the recording
  await page.waitForSelector('#ovGo'); await page.click('#ovGo'); await waitFor(async () => await page.evaluate(() => !!S), 'the saved game to resume');
  await page.evaluate(() => closeOverlay()); await page.click('#menuBtn');
  assert.match(await page.textContent('.panel'), /Signed in as pat@example.com/);
  await page.click('#menuOut'); assert.match(await page.textContent('#menuOut'), /Tap again/);
  await page.click('#menuOut'); await waitFor(async () => /Signed out/.test(await page.textContent('.msg')), 'signed out');
  assert.strictEqual((await (await fetch(base + '/api/me', { headers: { cookie: (await ctx.cookies()).map((c) => c.name + '=' + c.value).join('; ') } })).json()).signedIn, false);
  assert.strictEqual(await page.evaluate(() => Remote.recording()), false);
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
  // the glossary popover goes away when an overlay opens, and the Bank tab shows as selected while the books are open
  await page.evaluate(() => { const pop = document.querySelector('#pop'); pop.hidden = false; booksPanel(); });
  assert.strictEqual(await page.isHidden('#pop'), true);
  assert.strictEqual(await page.getAttribute('#bankBtn', 'aria-current'), 'true');
  await page.evaluate(() => closeOverlay());
  assert.strictEqual(await page.getAttribute('#bankBtn', 'aria-current'), 'false');
  assert.strictEqual(await page.isVisible('#policyBtn'), false);
  await page.evaluate(() => { S.progress.unlocked.push('pricing'); closeOverlay(); hud(); });
  assert.strictEqual(await page.isVisible('#policyBtn'), true);
  await page.evaluate(() => { dispatch({ type: 'nextYear' }); closeOverlay(); });
  await page.click('#policyBtn');
  // the executive team: four advisers and the early warnings, then the stress test
  assert.match(await page.textContent('.panel'), /Your executive team/);
  for (const r of ['Finance director', 'Chief risk officer', 'Treasurer', 'Head of operations']) assert.match(await page.textContent('.panel'), new RegExp(r));
  assert(await page.locator('.ewi').count() >= 8, 'early warning indicators are listed');
  assert(await page.locator('.gauge').count() >= 3, 'gauges for capital, liquidity and trust'); assert(await page.locator('.chart').count() === 3, 'trend charts');
  await page.click('#tourOk'); assert.strictEqual(await page.$('#tourHint'), null, 'the hint goes when dismissed');
  assert.match(await page.textContent('.panel'), /Funding ladder/); assert.match(await page.textContent('.panel'), /Within a month/);
  assert(await page.locator('.ewi').count() >= 12, 'hedging and ladder indicators are listed');
  await page.click('[data-seg=stress]');
  const before = await page.evaluate(() => JSON.stringify([S.cash, S.deposits, S.rs, S.month, S.loans.length]));
  await page.click('#stRun');
  await waitFor(async () => /Lowest capital ratio/.test(await page.textContent('.panel')), 'stress test result');
  assert.strictEqual(await page.evaluate(() => JSON.stringify([S.cash, S.deposits, S.rs, S.month, S.loans.length])), before, 'the stress test does not change the real bank');
  assert.strictEqual(await page.evaluate(() => !!S.stress), true);
  await page.selectOption('#stScn', 'rates'); await page.click('#stRun');
  await waitFor(async () => (await page.evaluate(() => S.stress && S.stress.scenario)) === 'rates', 'rate shock run');
  await page.click('[data-seg=settings]');
  assert.match(await page.textContent('.panel'), /Stress test, rate shock \(/);          // the last result stays visible
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
  // once an area is taken over the board watches: its confidence shows, and the player can resign
  await page.evaluate(() => { dispatch({ type: 'setPolicy', area: 'pricing', values: { mortgageSpread: 1.1 } }); for (let c; (c = current());) dispatch({ type: 'resolve', id: c.id, k: c.opts[0].k }); dispatch({ type: 'closeMonth' }); closeOverlay(); hud(); });
  await page.click('#policyBtn');
  assert.match(await page.textContent('.panel'), /Confidence \d+ \/ 100/);
  assert.match(await page.textContent('.panel'), /Share price £\d/);
  // operations: once taken over, the Team screen shows each team's staff, load and backlog
  await page.evaluate(() => { S.tutorial = false; S.progress.unlocked.push('operations', 'growth'); dispatch({ type: 'setPolicy', area: 'operations', values: {} }); dispatch({ type: 'setPolicy', area: 'growth', values: { launchBtl: 1, marketing: 3, town4: 1 } }); for (let c; (c = current());) dispatch({ type: 'resolve', id: c.id, k: c.opts[0].k }); dispatch({ type: 'closeMonth' }); closeOverlay(); hud(); teamScreen(); });
  assert.match(await page.textContent('.panel'), /Staff \/ advised/);
  assert.match(await page.textContent('.panel'), /Fraud operations/);
  assert.match(await page.textContent('.panel'), /Buy-to-let mortgages/); assert.match(await page.textContent('.panel'), /Eskdale/);
  await page.click('summary:has-text("Resign")'); await page.click('#exResign');
  await waitFor(async () => /steps down/.test(await page.textContent('.panel')), 'the Herald reports the resignation');
  assert.strictEqual(await page.evaluate(() => S.over), 'resigned');
  assert.deepStrictEqual(errors, []);
  await ctx.close();
});

test('the page without an account: the game is recorded anonymously, the player was told, and cannot switch it off or delete it', { skip: !EDGE && 'no Edge/Chrome found' }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 860 } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/');
  await page.waitForSelector('#ovTrain');
  // the only notice is about the cookie, and it goes when it is dismissed and stays gone
  assert.strictEqual(await page.isVisible('#cookieNote'), true); assert.match(await page.textContent('#cookieNote'), /uses a cookie to record your game sessions/);
  assert.doesNotMatch(await page.textContent('.panel'), /recorded|recording/i, 'no other notice on the title screen');
  await page.click('#cookieOk'); assert.strictEqual(await page.isHidden('#cookieNote'), true);
  await page.reload(); await page.waitForSelector('#ovTrain'); assert.strictEqual(await page.isHidden('#cookieNote'), true);
  assert.strictEqual((await pool.query('SELECT count(*)::int n FROM account.player WHERE guest')).rows[0].n, 0, 'nobody is created just by opening the page');

  await page.click('#ovNew');
  await waitFor(async () => (await pool.query('SELECT count(*)::int n FROM bank.game g JOIN account.player p ON p.player_key = g.player_key WHERE p.guest')).rows[0].n === 1, 'guest game on the server');
  await page.waitForFunction(() => S && S.seed);                       // the server row exists before the page has started its own game
  await page.evaluate(() => { closeOverlay(); for (let c; (c = current());) dispatch({ type: 'resolve', id: c.id, k: c.opts.find((o) => !(o.cash && S.cash < o.cash)).k }); closeBooks(); });
  await page.evaluate(() => closeOverlay()); await page.click('#menuBtn'); assert.match(await page.textContent('.panel'), /Playing as a guest/); assert.strictEqual(await page.$('#menuOut'), null, 'a guest has no password to sign out of'); await page.click('#menuResume');
  const r = await waitFor(async () => { const x = await page.evaluate(() => JSON.parse(localStorage.getItem('bm-remote') || '{}')); return x.pending && x.pending.length === 0 && x.seq > 3 && x; }, 'commands to reach the server');
  const gameId = (await pool.query('SELECT g.id FROM bank.game g JOIN account.player p ON p.player_key = g.player_key WHERE p.guest')).rows[0].id;
  assert.deepStrictEqual((await verifyGame(pool, host, gameId)).problems, []);
  assert.strictEqual((await pool.query('SELECT count(*)::int n FROM bank.journal_line WHERE game_id = $1', [gameId])).rows[0].n > 0, true);

  // a returning visit uses the same guest, and there is nothing to switch recording off with
  await page.reload(); await page.waitForSelector('#ovAcct');
  assert.match(await page.textContent('#ovAcct'), /guest/);
  await page.click('#ovAcct');
  assert.strictEqual(await page.locator('text=/delete/i').count(), 0, 'a guest is not offered deletion');
  assert.strictEqual(await page.locator('text=/record/i').filter({ hasText: /don.t|stop|off|opt/i }).count(), 0, 'no way to switch recording off on the account screen');
  await page.click('#acBack');
  assert.strictEqual(await page.$('#ovRecOff'), null, 'no switch on the title screen');
  await page.click('#ovNew');
  await waitFor(async () => (await pool.query('SELECT count(*)::int n FROM bank.game g JOIN account.player p ON p.player_key = g.player_key WHERE p.guest')).rows[0].n === 2, 'the next game is recorded too');
  assert.deepStrictEqual(errors, []);
  await ctx.close();
});

test('the executive meeting on the page: a new career queues settings for next month, and they can be withdrawn', { skip: !EDGE && 'no Edge/Chrome found' }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 860 } }); const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file:///' + require('path').resolve(__dirname, '..', 'Bank Manager.html').replace(/\\/g, '/'));
  await page.waitForSelector('#ovTrain'); await page.click('#ovTrain');
  await page.evaluate(() => { closeOverlay(); localStorage.setItem('ch-best', JSON.stringify({ score: 1, letter: 'C' })); });
  await page.evaluate(() => startGame());
  await waitFor(async () => await page.evaluate(() => !!(S && S.meet)), 'a new career with the meeting');
  await page.evaluate(() => { S.progress.unlocked.push('pricing'); closeOverlay(); hud(); });
  await page.click('#policyBtn'); await page.click('[data-seg=settings]');
  assert.match(await page.textContent('.panel'), /Executive meeting: changes you save here take effect at the start of next month/);
  await page.fill('input[data-key=mortgageSpread]', '1.4'); await page.click('#plSave');
  await waitFor(async () => /Saved for the meeting/.test(await page.textContent('.acct .msg')), 'queued');
  assert.strictEqual(await page.evaluate(() => S.policy.pricing.mortgageSpread), 1.05, 'not changed yet');
  assert.strictEqual(await page.evaluate(() => S.pq.length), 1);
  assert.match(await page.textContent('.panel'), /Waiting for next month/); assert.strictEqual(await page.inputValue('input[data-key=mortgageSpread]'), '1.4', 'the form shows what it will become');
  await page.click('#plCancel'); await waitFor(async () => /Nothing is waiting/.test(await page.textContent('.acct .msg')), 'withdrawn');
  assert.strictEqual(await page.evaluate(() => S.pq.length), 0);
  await page.fill('input[data-key=mortgageSpread]', '1.3'); await page.click('#plSave');
  await waitFor(async () => (await page.evaluate(() => S.pq.length)) === 1, 'queued again');
  await page.evaluate(() => { closeOverlay(); for (let c; (c = current());) dispatch({ type: 'resolve', id: c.id, k: c.opts[0].k }); dispatch({ type: 'closeMonth' }); });
  assert.strictEqual(await page.evaluate(() => S.policy.pricing.mortgageSpread), 1.3, 'in force at the start of next month');
  assert.deepStrictEqual(errors, []);
  await ctx.close();
});

test('the game menu: pause, save, sound, exit to the title and back, with Escape to open and close it', { skip: !EDGE && 'no Edge/Chrome found' }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 860 } }); const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file:///' + require('path').resolve(__dirname, '..', 'Bank Manager.html').replace(/\\/g, '/'));
  await page.waitForSelector('#ovTrain'); await page.click('#ovTrain');
  await page.evaluate(() => closeOverlay());
  assert.strictEqual(await page.isVisible('#menuBtn'), true);
  await page.click('#menuBtn');
  const panel = await page.textContent('.panel');
  for (const t of ['Paused', 'Resume', 'Save game', 'Sound', 'Save and exit to the title screen']) assert(panel.includes(t), t);
  assert.strictEqual(await page.$('#menuOut'), null, 'no sign out when not signed in');
  assert.strictEqual(await page.evaluate(() => Scene.isPaused), true, 'the scene is paused while the menu is open');
  await page.click('#menuResume'); assert.strictEqual(await page.isHidden('#ov'), true); assert.strictEqual(await page.evaluate(() => Scene.isPaused), false, 'and running again');
  // Escape opens and closes it
  await page.keyboard.press('Escape'); await page.waitForSelector('#menuResume'); await page.keyboard.press('Escape'); assert.strictEqual(await page.isHidden('#ov'), true);
  // save, and the sound switch
  await page.click('#menuBtn'); const was = await page.textContent('#menuSound'); await page.click('#menuSound');
  assert.notStrictEqual(await page.textContent('#menuSound'), was);
  await page.click('#menuSave'); assert.match(await page.textContent('.msg'), /Saved on this device/);
  assert.strictEqual(await page.evaluate(() => !!JSON.parse(localStorage.getItem(KEY) || 'null')), true, 'the game is in local storage');
  // exit to the title, then continue where it was
  const month = await page.evaluate(() => S.month);
  await page.click('#menuExit'); await page.waitForSelector('#ovGo');
  assert.strictEqual(await page.evaluate(() => S), null); assert.match(await page.textContent('.panel'), /Continue/);
  await page.click('#ovGo'); await page.waitForFunction(() => S && S.month !== undefined);
  assert.strictEqual(await page.evaluate(() => S.month), month); assert.strictEqual(await page.isHidden('#ov'), true);
  assert.deepStrictEqual(errors, []);
  await ctx.close();
});

test('display settings: text size, theme and volume apply at once, are kept across a reload, and the hall still shows on a 320px screen', { skip: !EDGE && 'no Edge/Chrome found' }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 320, height: 568 }, colorScheme: 'dark' }); const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const url = 'file:///' + require('path').resolve(__dirname, '..', 'Bank Manager.html').replace(/\\/g, '/');
  await page.goto(url); await page.waitForSelector('#ovTrain');
  assert.strictEqual(await page.evaluate(() => document.documentElement.dataset.theme), 'dark', 'with the default "same as device" a dark device gets the dark theme');
  await page.click('#ovDisp'); await page.waitForSelector('#dsBack');
  const base = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#ov .dim')).fontSize));
  await page.click('#ov [data-ts="larger"]'); await page.click('#ov [data-th="light"]'); await page.fill('#dsVol', '35'); await page.dispatchEvent('#dsVol', 'input');
  assert.strictEqual(await page.evaluate(() => document.documentElement.dataset.ts), 'larger');
  assert.strictEqual(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
  assert.strictEqual(await page.getAttribute('#ov [data-ts="larger"]', 'aria-pressed'), 'true'); assert.strictEqual(await page.getAttribute('#ov [data-ts="normal"]', 'aria-pressed'), 'false');
  assert.strictEqual(await page.textContent('#dsVolOut'), '35%');
  const bigger = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#ov .dim')).fontSize));
  assert(bigger > base * 1.2, `larger text is bigger: ${base} to ${bigger}`);
  await page.reload(); await page.waitForSelector('#ovTrain');
  assert.strictEqual(await page.evaluate(() => [document.documentElement.dataset.ts, document.documentElement.dataset.theme, Snd.volume].join(' ')), 'larger light 0.35', 'the settings come back after a reload');
  // the game does not know about any of it: a new game's state has nothing from these settings
  await page.click('#ovTrain'); await page.waitForTimeout(800);
  assert.strictEqual(await page.evaluate(() => JSON.stringify(S).includes('larger') || JSON.stringify(S).includes('light')), false);
  // a customer is speaking: on a screen this small the line is one strip, not a block over the hall
  await page.evaluate(() => { Display.set('ts', 'normal'); closeOverlay(); });
  const bubble = await page.evaluate(() => { const b = document.querySelector('#bubble'); if (!b || b.hidden || getComputedStyle(b).display === 'none') return null; const r = b.getBoundingClientRect(), st = document.querySelector('#stage').getBoundingClientRect(); return { h: r.height, stage: st.height, w: r.width }; });
  if (bubble) assert(bubble.h < bubble.stage * 0.4, `the bubble covers less than 40% of the hall: ${JSON.stringify(bubble)}`);
  assert.deepStrictEqual(errors, []); await ctx.close();
});
