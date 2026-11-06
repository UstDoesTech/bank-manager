// Balancing check for pricing: a careful bot plays the same seeds at different prices. Price changes should not be
// free money: the system price should be close to the best, and the extremes should be clearly worse.
//   node tools/policy-sweep.js            prints the table
const fs = require('fs'), path = require('path');
const { loadEngine, play } = require('./harness');
const src = fs.readFileSync(path.join(__dirname, '..', 'engine', 'engine.js'), 'utf8');
const SEEDS = Array.from({ length: +(process.env.SEEDS || 24) }, (_, i) => 100 + i * 7);

const YEARS = +(process.env.YEARS || 1);
function profit(values, bot = 'careful') {
  let total = 0, failed = 0;
  for (const seed of SEEDS) {
    const E = loadEngine(src);
    const { S } = play(E, seed, bot, YEARS, {}, (run, e) => { e.S.progress.unlocked.push('pricing'); run({ type: 'setPolicy', area: 'pricing', values }); });
    total += E.rating().profit; if (YEARS > 1) total += (E.S.career || []).reduce((a, c) => a + c.profit, 0); if (S.over && S.over !== 'done') failed++;
  }
  return { mean: total / SEEDS.length, failed };
}

const SWEEPS = {
  mortgageSpread: [0.4, 0.8, 1.05, 1.5, 2.5, 4],
  personalLow: [5, 7, 8.9, 11, 14, 20],
  personalHigh: [10, 15, 18.9, 23, 30, 40],
  cardRate: [15, 20, 24.9, 30, 40],
};
function sweep() {
  const out = {};
  for (const [key, vals] of Object.entries(SWEEPS)) out[key] = vals.map((v) => ({ v, ...profit({ [key]: v }) }));
  return out;
}
module.exports = { sweep, profit, SWEEPS, SEEDS };

if (require.main === module) {
  const res = sweep();
  for (const [key, rows] of Object.entries(res)) {
    console.log('\n' + key);
    for (const r of rows) console.log('  ' + String(r.v).padStart(5) + '  mean profit ' + r.mean.toFixed(1).padStart(8) + (r.failed ? '  failed ' + r.failed : ''));
  }
}
