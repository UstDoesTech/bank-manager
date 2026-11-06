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

if (require.main === module && !process.argv.includes('--credit')) {
  const res = sweep();
  for (const [key, rows] of Object.entries(res)) {
    console.log('\n' + key);
    for (const r of rows) console.log('  ' + String(r.v).padStart(5) + '  mean profit ' + r.mean.toFixed(1).padStart(8) + (r.failed ? '  failed ' + r.failed : ''));
  }
}

// Credit policy: the desk decides by policy. Compare the executive team's cut-offs with looser and tighter ones, and
// with playing every case by hand. Loose should lose money to defaults, tight should lose business.
const CREDIT = {
  'by hand (careful bot)': null,
  'tight': { mortgageMaxLtv: 75, mortgageMaxLti: 3.5, mortgageMaxAff: 0.3, mortgageMinScore: 700, personalMinScore: 740, personalMaxDebtRatio: 0.3 },
  'system': {},
  'loose': { mortgageMaxLtv: 95, mortgageMaxLti: 6.5, mortgageMaxAff: 0.6, mortgageMinScore: 400, personalMinScore: 400, personalMaxDebtRatio: 1.2 },
  'anything goes': { mortgageMaxLtv: 100, mortgageMaxLti: 8, mortgageMaxAff: 0.8, mortgageMinScore: 300, personalMinScore: 300, personalMaxDebtRatio: 2 },
};
function creditRun(values, bot = 'careful') {
  let total = 0, failed = 0, defaults = 0, lent = 0;
  for (const seed of SEEDS) {
    const E = loadEngine(src);
    const { S } = play(E, seed, bot, YEARS, {}, values === null ? null : (run, e) => { e.S.progress.unlocked.push('pricing', 'credit'); run({ type: 'setPolicy', area: 'credit', values }); });
    total += E.rating().profit; if (YEARS > 1) total += (E.S.career || []).reduce((a, c) => a + c.profit, 0);
    if (S.over && S.over !== 'done') failed++;
    defaults += S.stats.defaults; lent += S.stats.lent;
  }
  return { mean: total / SEEDS.length, failed, defaults: defaults / SEEDS.length, lent: lent / SEEDS.length };
}
module.exports.creditRun = creditRun; module.exports.CREDIT = CREDIT;
if (require.main === module && process.argv.includes('--credit')) {
  console.log('\ncredit policy');
  for (const [name, v] of Object.entries(CREDIT)) { const r = creditRun(v); console.log('  ' + name.padEnd(20) + 'mean profit ' + r.mean.toFixed(1).padStart(8) + '  defaults ' + r.defaults.toFixed(1).padStart(5) + '  lent ' + r.lent.toFixed(0).padStart(7) + (r.failed ? '  failed ' + r.failed : '')); }
}
