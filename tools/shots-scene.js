'use strict';
// Screenshots the 3D hall (all upgrades owned) at several screen shapes, to check the framing.
//   node tools/shots-scene.js     writes shots/hall-<size>.png
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!EDGE) { console.error('No Edge or Chrome found.'); process.exit(1); }
const out = path.join(__dirname, '..', 'shots'); fs.mkdirSync(out, { recursive: true });
const url = 'file:///' + path.resolve(__dirname, '..', 'Bank Manager.html').replace(/\\/g, '/');
const sizes = { 'phone-portrait': [390, 844], 'phone-landscape': [844, 390], 'small-phone': [320, 568], tablet: [768, 1024], 'tablet-landscape': [1024, 768], laptop: [1366, 768], ultrawide: [2560, 1080] };

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [name, [width, height]] of Object.entries(sizes)) {
    const page = await (await browser.newContext({ viewport: { width, height } })).newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url); await page.waitForSelector('#ovTrain'); await page.click('#ovTrain'); await page.waitForTimeout(1200);
    await page.evaluate(() => { closeOverlay(); S.up = S.up || {}; Object.assign(S.up, { analyst: true, refurb: true, app: true, cashier: true }); S.queue.forEach((c, i) => c.done = i % 2 === 0); Scene.boards(); Scene.sync(); Scene.setView('hall', true); Scene.setCard(true); });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(out, `hall-${name}.png`) });
    if (errors.length) console.error(name, errors);
    await page.close();
  }
  await browser.close(); console.log('done');
})();
