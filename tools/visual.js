'use strict';
// Screenshot comparison: layout drift caught the way the golden snapshots catch engine drift.
//   npm run visual            compares every screen with its approved image and exits 1 on a difference
//   npm run visual:update     approves what the page looks like now (writes the baseline images)
//   node tools/visual.js --only phone-counter   one image, or a prefix
//
// To be repeatable the page is played with a fixed game seed and a fixed random number source, animations are switched off, the 3D
// canvas is hidden (its frames depend on timing and the graphics card) and every request that is not a local file is blocked, so web
// fonts and the 3D library cannot vary the result. The text then uses the fonts installed on the machine, which differ between systems,
// so the approved images are kept for one platform at a time: test/visual/baseline/<platform>/. Where there are none the check is skipped.
//
// Differences are written to shots/visual-diff/ as <name>.actual.png, <name>.expected.png and <name>.diff.png.
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');

const ROOT = path.join(__dirname, '..');
const BASE = path.join(ROOT, 'test', 'visual', 'baseline', process.platform);
const OUT = path.join(ROOT, 'shots', 'visual-diff');
const PAGE = 'file:///' + path.resolve(ROOT, 'Bank Manager.html').replace(/\\/g, '/');
const TOLERANCE = 0.0005;                 // the share of pixels that may differ before an image fails (0.05%)
const args = process.argv.slice(2), UPDATE = args.includes('--update'), only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!EDGE) { console.log('visual: no Edge or Chrome found, skipped'); process.exit(0); }
if (!UPDATE && !fs.existsSync(BASE)) { console.log(`visual: no approved images for ${process.platform} (${path.relative(ROOT, BASE)}), skipped. Run npm run visual:update to approve this machine's.`); process.exit(0); }

// What to capture. Each run is one viewport and one display setting; "steps" are the screens, in the order they are reached.
const ALL = ['title', 'training', 'counter', 'inbox', 'books', 'branch', 'goals', 'month-end', 'year-end', 'replay', 'herald', 'debrief', 'menu', 'display',
  'team', 'settings', 'settings-preview', 'stress', 'rivals'];
const RUNS = [
  { name: 'phone', w: 390, h: 844, display: {}, steps: ALL },
  { name: 'desktop', w: 1280, h: 800, display: {}, steps: ALL },
  { name: 'phone-light', w: 390, h: 844, display: { theme: 'light' }, steps: ['title', 'counter', 'inbox', 'books', 'goals', 'year-end', 'team', 'settings', 'display'] },
  { name: 'phone-larger', w: 390, h: 844, display: { ts: 'larger' }, steps: ['title', 'counter', 'books', 'year-end', 'team', 'settings'] },
  { name: 'small', w: 320, h: 568, display: {}, steps: ['title', 'counter', 'inbox', 'team'] },
];

// Browser-side set-ups. A career game (seed 11) and a chief executive game (seed 21) are used so every screen has something on it.
const STEP = {
  title: () => { closeOverlay(); S = null; titleScreen(); },
  training: () => { dispatch({ type: 'newGame', seed: 5, opts: { tutorial: true } }); vtrain(); },
  counter: () => { vcareer(); setView('counter'); },
  inbox: () => { vcareer(); setView('inbox'); },
  books: () => { vcareer(); closeOverlay(); booksPanel(); },
  branch: () => { vcareer(); closeOverlay(); branchPanel(); },
  goals: () => { vcareer(); closeOverlay(); goalsPanel(); },
  'month-end': () => { vcareer(); closeOverlay(); while (!S.over && S.month < 3) { vplay(); closeBooks && closeBooks(); if (S.month < 3) closeOverlay(); } },
  'year-end': () => { vcareer(); closeOverlay(); while (!S.over) { vplay(); dispatch({ type: 'closeMonth' }); } closeOverlay(); endScreen(); },
  replay: () => replayScreen(),
  herald: () => herald(),
  debrief: () => debriefScreen(),
  menu: () => { vcareer(); closeOverlay(); menuScreen(); },
  display: () => displayScreen(),
  team: () => { vexec(); closeOverlay(); teamScreen(); },
  settings: () => { vexec(); policyScreen(); },
  'settings-preview': () => { vexec(); policyScreen(); const i = document.querySelector('input[data-key="liquidityTarget"]'); i.value = '0.4'; i.dispatchEvent(new Event('input', { bubbles: true })); },
  stress: () => { vexec(); stressScreen(); },
  rivals: () => { vexec(); closeOverlay(); rivalsPanel(); },
};
// helpers that live in the page
const HELPERS = `
  window.vplay = () => { for (let c; (c = current());) dispatch({ type: 'resolve', id: c.id, k: c.opts[0].k }); };
  window.vtrain = () => { closeOverlay(); begin3(); setView('counter'); renderCounter(true); };
  window.vwhich = null;
  window.vcareer = () => { if (window.vwhich === 'career') return; window.vwhich = 'career'; closeOverlay(); dispatch({ type: 'newGame', seed: 11, opts: { households: true, meetings: true, rivals: true } }); begin3(); setView('counter'); renderCounter(true); };
  window.vexec = () => { if (window.vwhich === 'exec') return; window.vwhich = 'exec'; closeOverlay(); dispatch({ type: 'newGame', seed: 21, opts: { households: true, meetings: true, rivals: true, chiefExecutive: true } });
    for (let m = 0; m < 3; m++){ window.vplay(); dispatch({ type: 'closeMonth' }); } begin3(); setView('counter'); renderCounter(true); closeOverlay(); };
`;

// The seeded random number source, and a quiet page.
const INIT = `(() => { let a = 12345; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();`;
const QUIET = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}#c{visibility:hidden!important}';

const png = (buf) => PNG.sync.read(buf);
async function settle(page) {
  await page.evaluate(() => Promise.all([document.fonts.ready, ...document.getAnimations().map((a) => a.finished.catch(() => 0))]));
  await page.evaluate(() => document.querySelectorAll('#ov, #ov .panel, #inbox, #desk, #mlist, #mview').forEach((e) => { e.scrollTop = 0; }));
  await page.waitForTimeout(120);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true }); if (UPDATE) fs.mkdirSync(BASE, { recursive: true });
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  let total = 0, failed = [], written = 0, missing = [];
  for (const run of RUNS) {
    const ctx = await browser.newContext({ viewport: { width: run.w, height: run.h }, deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: 'dark', locale: 'en-GB', timezoneId: 'Europe/London' });
    await ctx.route((u) => u.protocol !== 'file:', (r) => r.abort());
    await ctx.addInitScript(INIT);
    if (Object.keys(run.display).length) await ctx.addInitScript(`try { localStorage.setItem('bm-display', ${JSON.stringify(JSON.stringify(run.display))}); } catch (e) {}`);
    const page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(PAGE); await page.waitForSelector('#ovTrain'); await page.addStyleTag({ content: QUIET });
    await page.evaluate(HELPERS);
    // the helpers and steps share the page's global scope, so they are sent as one script
    await page.evaluate(`Object.assign(window, { __steps: { ${Object.entries(STEP).map(([k, f]) => JSON.stringify(k) + ': ' + f.toString()).join(', ')} } })`);
    for (const step of run.steps) {
      const name = `${run.name}-${String(ALL.indexOf(step) + 1).padStart(2, '0')}-${step}`;
      if (only && !name.startsWith(only)) continue;
      await page.evaluate(`window.__steps[${JSON.stringify(step)}]()`); await settle(page);
      const actual = await page.screenshot({ type: 'png' }); total++;
      const file = path.join(BASE, name + '.png');
      if (UPDATE) { fs.writeFileSync(file, actual); written++; continue; }
      if (!fs.existsSync(file)) { missing.push(name); fs.writeFileSync(path.join(OUT, name + '.actual.png'), actual); continue; }
      const A = png(actual), B = png(fs.readFileSync(file));
      if (A.width !== B.width || A.height !== B.height) { failed.push(`${name}: the picture is ${A.width}x${A.height}, approved is ${B.width}x${B.height}`); fs.writeFileSync(path.join(OUT, name + '.actual.png'), actual); continue; }
      const diff = new PNG({ width: A.width, height: A.height }), n = pixelmatch(A.data, B.data, diff.data, A.width, A.height, { threshold: 0.1 });
      if (n / (A.width * A.height) > TOLERANCE) {
        failed.push(`${name}: ${n} pixels differ (${(n / (A.width * A.height) * 100).toFixed(2)}%, allowed ${(TOLERANCE * 100).toFixed(2)}%)`);
        fs.writeFileSync(path.join(OUT, name + '.actual.png'), actual); fs.writeFileSync(path.join(OUT, name + '.expected.png'), fs.readFileSync(file)); fs.writeFileSync(path.join(OUT, name + '.diff.png'), PNG.sync.write(diff));
      }
    }
    if (errors.length) { failed.push(run.name + ': page errors: ' + errors.slice(0, 2).join('; ')); }
    await ctx.close();
  }
  await browser.close();
  if (UPDATE) { console.log(`visual: approved ${written} images in ${path.relative(ROOT, BASE)}`); return; }
  if (missing.length) failed.push(`no approved image for: ${missing.join(', ')} (run npm run visual:update to approve)`);
  if (failed.length) { console.error(`visual: ${failed.length} problem${failed.length === 1 ? '' : 's'} in ${total} images\n  ` + failed.join('\n  ') + `\n  differences are in ${path.relative(ROOT, OUT)}`); process.exit(1); }
  console.log(`visual: ${total} images match their approved versions`);
})().catch((e) => { console.error('visual: ERR', e.message); process.exit(2); });
