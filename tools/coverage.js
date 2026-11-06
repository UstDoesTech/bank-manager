// Plays every bot over many seeds (plus each scenario and the tutorial) and reports which card/option pairs were
// exercised, which were never reached, how games ended and the spread of ratings.
const fs = require('fs'), path = require('path');
const { loadEngine, play, ALL } = require('./harness');
const src = fs.readFileSync(path.join(__dirname, '..', 'engine', 'engine.js'), 'utf8');
const SEEDS = +process.argv[2] || 40, hit = {}, ends = {}, letters = {};
const E = loadEngine(src);
const tap = (cmd) => cmd;
function run(bot, seed, opts){
  const g = play(E, seed, bot, 3, opts);
  // replay the command log once more on a fresh engine to attribute card kinds/options
  const E2 = loadEngine(src);
  for (const cmd of g.cmds){
    if (cmd.type === 'resolve'){ const c = E2.S.queue.find(x => x.id === cmd.id); const key = c.kind + ':' + cmd.k; hit[key] = (hit[key] || 0) + 1; }
    E2.dispatch(cmd);
  }
  const e = bot + '/' + (g.S.over || 'open'); ends[e] = (ends[e] || 0) + 1;
  const L = E2.rating().letter; letters[L] = (letters[L] || 0) + 1;
}
for (const bot of ALL()) for (let s = 1; s <= SEEDS; s++) run(bot, s);
E.dispatch({ type: 'newGame', seed: 1 });
for (const k of Object.keys(E.SCENARIOS)) for (const bot of ['careful', 'noisy25', 'first']) for (let s = 1; s <= 8; s++) run(bot, s, { scenario: k });
for (const bot of ['careful', 'first']) for (let s = 1; s <= 8; s++) run(bot, s, { tutorial: true });
// all (kind, option) pairs the engine can offer, from a wide sample of generated cards
const all = new Set(), E3 = loadEngine(src);
for (let seed = 1; seed <= 200; seed++){ E3.dispatch({ type: 'newGame', seed }); for (const bot of ['careful']) { for (let m = 0; m < 3 && !E3.S.over; m++){ for (let c; (c = E3.current());){ for (const o of c.opts) all.add(c.kind + ':' + o.k); E3.dispatch({ type: 'resolve', id: c.id, k: c.opts[0].k }); } E3.dispatch({ type: 'closeMonth' }); } } }
const missing = [...all].filter(k => !hit[k]).sort();
console.log(`pairs offered ${all.size}, exercised ${[...all].length - missing.length}`);
console.log('never exercised:', missing.join(', ') || 'none');
console.log('rare (<20 hits):', Object.entries(hit).filter(([, n]) => n < 20).map(([k, n]) => k + '=' + n).join(', ') || 'none');
console.log('ratings:', JSON.stringify(letters));
console.log('endings:', JSON.stringify(ends));
