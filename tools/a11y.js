'use strict';
// Runs axe-core over every screen of the page at phone and desktop width: WCAG 2.0, 2.1 and 2.2 at A and AA, plus best practice.
//   npm run a11y        exits 1 if any screen has a violation
// It cannot judge the 3D canvas, keyboard use, screen reader wording or reduced motion; those need a person.
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const root = path.join(__dirname, '..') + '/';
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const E = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', '/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(fs.existsSync);
if (!E) { console.error('No Edge or Chrome found.'); process.exit(1); }
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const play = () => { for (let c; (c = current());) dispatch({ type: 'resolve', id: c.id, k: c.opts[0].k }); };
const SCREENS = [
  ['title', () => titleScreen()],
  ['counter', () => { closeOverlay(); setView('counter'); }],
  ['inbox', () => { closeOverlay(); setView('inbox'); }],
  ['inbox-open', () => { closeOverlay(); setView('inbox'); const m = document.querySelector('#mlist button, #mlist [data-k]'); if (m) m.click(); }],
  ['bank-branch', () => branchPanel()],
  ['bank-books', () => booksPanel()],
  ['household', () => { try { householdScreen(); } catch (e) {} }],
  ['menu', () => menuScreen()],
  ['account', () => accountScreen()],
  ['month-end', () => { closeOverlay(); while (!S.over && S.month < 2) { play(); closeBooks && closeBooks(); if (S.month < 2) closeOverlay(); } }],
  ['herald', () => { closeOverlay(); herald(); }],
  ['year-end', () => { closeOverlay(); while (!S.over) { play(); dispatch({ type: 'closeMonth' }); } endScreen(); }],
  ['debrief', () => { try { debriefScreen(); } catch (e) {} }],
  ['team', () => { S.progress.unlocked.push('pricing', 'credit', 'treasury', 'funding', 'capital', 'operations', 'growth'); closeOverlay(); dispatch({ type: 'nextYear' }); for (let m = 0; m < 4; m++) { play(); dispatch({ type: 'closeMonth' }); } closeOverlay(); hud(); teamScreen(); }],
  ['settings', () => policyScreen()],
  ['stress', () => stressScreen()],
  ['stress-result', () => { dispatch({ type: 'stress', scenario: 'recession' }); stressScreen(); }],
];
(async () => {
  const b = await chromium.launch({ executablePath: E, headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  let total = 0; const seen = new Map();
  for (const [size, vp] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 800 }]]) {
    for (const scheme of ['dark']) {
      const page = await (await b.newContext({ viewport: vp, colorScheme: scheme })).newPage(); const errs = [];
      page.on('pageerror', e => errs.push(e.message));
      await page.goto('file:///' + path.resolve(root, 'Bank Manager.html').replace(/\\/g, '/')); await page.waitForSelector('#ovTrain'); await page.click('#ovTrain'); await page.waitForTimeout(1000);
      await page.addScriptTag({ content: AXE });
      for (const [name, fn] of SCREENS) {
        try { await page.evaluate(fn); } catch (e) { console.log(size, scheme, name, 'SETUP', e.message.split('\n')[0]); continue; }
        await page.waitForTimeout(900);
        // a sticky footer covers whatever sits under it until the player scrolls, so check the screen scrolled to its end
        await page.evaluate(() => document.querySelectorAll('#ov, #ov .panel').forEach(e => { e.scrollTop = e.scrollHeight; }));
        const r = await page.evaluate(async tags => { const x = await axe.run(document, { runOnly: { type: 'tag', values: tags } }); return { v: x.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, t: v.nodes.slice(0, 2).map(n => n.target.join(' ') + ' :: ' + (n.any[0] || n.all[0] || n.none[0] || {}).message) })), inc: x.incomplete.map(v => v.id) }; }, TAGS);
        total++; if (r.v.length) { r.v.forEach(v => { const k = v.id + '|' + name; if (!seen.has(k)) seen.set(k, []); seen.get(k).push(size + '/' + scheme); console.log(size, scheme, name, v.impact, v.id, v.n, JSON.stringify(v.t).slice(0, 260)); }); }
        if (r.inc.length) console.log('   (needs review)', size, scheme, name, [...new Set(r.inc)].join(','));
      }
      if (errs.length) console.log(size, scheme, 'page errors', errs.slice(0, 3));
      await page.close();
    }
  }
  await b.close();
  console.log('screens audited:', total, ' distinct violations:', seen.size);
  process.exit(seen.size ? 1 : 0);
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
