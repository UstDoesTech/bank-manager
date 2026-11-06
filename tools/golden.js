// Generates golden snapshots from an engine inside a given HTML file: node tools/golden.js <html> <out.json>
// Run it against the ORIGINAL file to prove a refactor changes no behaviour; never regenerate to "fix" a failing test.
const fs = require('fs'), { loadEngine, play, hashState, ALL } = require('./harness');
const html = fs.readFileSync(process.argv[2], 'utf8');
const a = html.indexOf('<script id="engine">') + '<script id="engine">'.length, b = html.indexOf('</script>', a);
const E = loadEngine(html.slice(a, b));
const IGNORE = ['engine', 'progress', 'inbox', 'mailId', 'ledger'];   // fields added after the original engine
const out = {};
const add = (bot, seed, opts, tag) => { const { S } = play(E, seed, bot, 3, opts); out[`${bot}:${tag}:${seed}`] = hashState(S, IGNORE); };
E.dispatch ? E.dispatch({ type: 'newGame', seed: 1 }) : E.newGame(1);
for (const bot of ALL()) for (let seed = 1; seed <= 40; seed++) add(bot, seed, {}, 'std');
for (const k of Object.keys(E.SCENARIOS)) for (const bot of ['careful', 'noisy25', 'first']) for (let seed = 1; seed <= 5; seed++) add(bot, seed, { scenario: k }, 'scn-' + k);
for (const bot of ['careful', 'first']) for (let seed = 1; seed <= 5; seed++) add(bot, seed, { tutorial: true }, 'tutorial');
fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
console.log('wrote', Object.keys(out).length, 'snapshots');
