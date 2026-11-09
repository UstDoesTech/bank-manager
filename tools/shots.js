'use strict';
// Takes a screenshot of every main screen at phone and desktop width, for looking at the game and spotting drift.
//   npm run shots            writes PNGs to shots/ (ignored by git)
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!EDGE) { console.error('No Edge or Chrome found.'); process.exit(1); }
const out = path.join(__dirname, '..', 'shots'); fs.mkdirSync(out, { recursive: true });
const url = 'file:///' + path.resolve(__dirname, '..', 'Bank Manager.html').replace(/\\/g, '/');
const sizes = { phone: { width: 390, height: 844 }, desktop: { width: 1280, height: 800 } };

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [name, viewport] of Object.entries(sizes)) {
    const page = await (await browser.newContext({ viewport })).newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    const shot = async (what) => { await page.waitForTimeout(400); await page.screenshot({ path: path.join(out, `${name}-${what}.png`) }); };
    await page.goto(url); await page.waitForSelector('#ovTrain'); await shot('01-title');
    await page.click('#ovTrain'); await page.waitForTimeout(1200); await shot('02-counter');
    await page.click('#tabInbox'); await shot('03-inbox');
    await page.click('#bankBtn'); await shot('04-bank');
    await page.evaluate(() => closeOverlay());
    await page.evaluate(() => { while (!S.over && S.month < 3) { for (let c; (c = current());) dispatch({ type: 'resolve', id: c.id, k: c.opts[0].k }); closeBooks(); if (S.month < 3) closeOverlay(); } });
    await shot('05-month-end');
    await page.evaluate(() => { closeOverlay(); while (!S.over) { for (let c; (c = current());) dispatch({ type: 'resolve', id: c.id, k: c.opts[0].k }); dispatch({ type: 'closeMonth' }); } endScreen(); });
    await shot('06-year-end');
    await page.evaluate(() => replayScreen()); await shot('06b-replay');
    await page.evaluate(() => goalsPanel()); await shot('06c-goals');
    await page.evaluate(() => { S.tutorial = false; S.rivals = { on: true, intro: null, list: [] }; S.progress.unlocked.push('pricing'); rivalsSync(true); rivalsPanel(); }); await shot('06d-rivals');
    await page.evaluate(() => { S.progress.unlocked.push('pricing', 'credit', 'treasury', 'funding', 'capital', 'operations', 'growth'); closeOverlay(); dispatch({ type: 'nextYear' }); hud(); });
    await page.evaluate(() => { for (let m = 0; m < 4; m++) { for (let c; (c = current());) dispatch({ type: 'resolve', id: c.id, k: c.opts[0].k }); dispatch({ type: 'closeMonth' }); } closeOverlay(); hud(); teamScreen(); });
    await shot('07-executive-team');
    await page.evaluate(() => stressScreen()); await shot('08-stress');
    await page.evaluate(() => policyScreen()); await shot('09-settings');
    await page.evaluate(() => { const i = document.querySelector('input[data-key="liquidityTarget"]'); if (i) { i.value = '0.4'; i.dispatchEvent(new Event('input', { bubbles: true })); } }); await page.waitForTimeout(600); await shot('09b-settings-preview');
    await page.evaluate(() => menuScreen()); await shot('10-menu');
    if (errors.length) console.error(name, 'page errors:', errors);
    await page.close();
  }
  await browser.close();
  console.log('screenshots in', out);
})();
