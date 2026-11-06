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

if (require.main === module && !process.argv.includes('--credit') && !process.argv.some(a => a !== '--credit' && a.startsWith('--'))) {
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
if (require.main === module && process.argv.includes('--credit') && !process.argv.includes('--treasury') && !process.argv.includes('--capital')) {
  console.log('\ncredit policy');
  for (const [name, v] of Object.entries(CREDIT)) { const r = creditRun(v); console.log('  ' + name.padEnd(20) + 'mean profit ' + r.mean.toFixed(1).padStart(8) + '  defaults ' + r.defaults.toFixed(1).padStart(5) + '  lent ' + r.lent.toFixed(0).padStart(7) + (r.failed ? '  failed ' + r.failed : '')); }
}

// Treasury and capital: standing rules compared over the same games. A low cash target or all-long gilts should not be free money,
// and neither should never raising capital.
function areaRun(area, values, bot = 'careful', pre = []) {
  let total = 0, failed = 0, breaches = 0, minLiq = 0; const scores = [];
  for (const seed of SEEDS) {
    const E = loadEngine(src);
    const { S } = play(E, seed, bot, YEARS, {}, (run, e) => { e.S.progress.unlocked.push('pricing', 'credit', 'treasury', 'funding', 'capital'); for (const [a, v] of pre) run({ type: 'setPolicy', area: a, values: v }); run({ type: 'setPolicy', area, values }); });
    total += E.rating().profit; if (YEARS > 1) total += (E.S.career || []).reduce((a, c) => a + c.profit, 0);
    scores.push(E.rating().score);
    if (S.over && S.over !== 'done') failed++;
    breaches += S.stats.capBreach || 0; minLiq += S.history.length ? Math.min(...S.history.map((h) => h.liq)) : 0;
  }
  scores.sort((a, b) => a - b);
  return { mean: total / SEEDS.length, failed, breaches: breaches / SEEDS.length, minLiq: minLiq / SEEDS.length, score: scores.reduce((a, b) => a + b, 0) / scores.length, p10: scores[Math.floor(scores.length * 0.1)] };
}
const TREASURY = [
  ['target 12%, all short', { liquidityTarget: 0.12, longShare: 0 }], ['target 12%, all long', { liquidityTarget: 0.12, longShare: 1 }],
  ['target 20%, all short', { liquidityTarget: 0.2, longShare: 0 }], ['target 20%, half long', { liquidityTarget: 0.2, longShare: 0.5 }], ['target 20%, all long', { liquidityTarget: 0.2, longShare: 1 }],
  ['target 35%, all short', { liquidityTarget: 0.35, longShare: 0 }], ['target 50%, all short', { liquidityTarget: 0.5, longShare: 0 }],
];
const CAPITAL = [
  ['target 10.5%, carry on', { capitalTarget: 0.105, capitalAction: 2 }], ['target 12.5%, carry on', { capitalTarget: 0.125, capitalAction: 2 }],
  ['target 12.5%, raise 300', { capitalTarget: 0.125, capitalAction: 0, raiseAmount: 300 }], ['target 12.5%, sell mortgages', { capitalTarget: 0.125, capitalAction: 1 }],
  ['target 18%, raise 300', { capitalTarget: 0.18, capitalAction: 0, raiseAmount: 300 }], ['target 18%, raise 1000', { capitalTarget: 0.18, capitalAction: 0, raiseAmount: 1000 }],
  ['target 25%, raise 1000', { capitalTarget: 0.25, capitalAction: 0, raiseAmount: 1000 }],
];
const FUNDING = [
  ['spread -1.0', { savingsSpread: -1 }], ['spread -0.5', { savingsSpread: -0.5 }], ['spread 0', { savingsSpread: 0 }], ['spread +0.5', { savingsSpread: 0.5 }], ['spread +1.0', { savingsSpread: 1 }], ['spread +2.0', { savingsSpread: 2 }],
  ['wholesale 10%', { wholesaleTarget: 0.1 }], ['wholesale 20%', { wholesaleTarget: 0.2 }], ['wholesale 35%', { wholesaleTarget: 0.35 }],
];
const DIVIDENDS = [
  ['payout 0', { capitalTarget: 0.125, capitalAction: 0, dividendPayout: 0 }], ['payout 30%', { capitalTarget: 0.125, capitalAction: 0, dividendPayout: 0.3 }],
  ['payout 60%', { capitalTarget: 0.125, capitalAction: 0, dividendPayout: 0.6 }], ['payout 100%', { capitalTarget: 0.125, capitalAction: 0, dividendPayout: 1 }],
];
module.exports.areaRun = areaRun; module.exports.TREASURY = TREASURY; module.exports.CAPITAL = CAPITAL;
for (const [flag, area, rows] of [['--treasury', 'treasury', TREASURY], ['--capital', 'capital', CAPITAL], ['--funding', 'funding', FUNDING], ['--funding-desk', 'funding', FUNDING], ['--dividends', 'capital', DIVIDENDS]]) {
  if (require.main === module && process.argv.includes(flag)) {
    console.log('\n' + area + ' policy');
    for (const [name, v] of rows) { const r = areaRun(area, v, 'careful', flag === '--funding-desk' ? [['credit', {}]] : []); console.log('  ' + name.padEnd(28) + 'mean profit ' + r.mean.toFixed(1).padStart(8) + '  cap breaches ' + r.breaches.toFixed(2) + '  rating score ' + r.score.toFixed(1) + ' (worst tenth ' + r.p10.toFixed(1) + ')' + (r.failed ? '  failed ' + r.failed : '')); }
  }
}

// Bonds, large depositors and pool sales, with the lending desk running so that funding matters.
const BONDS = [['none', {}], ['bonds 10%, 1 year', { bondTarget: 0.1, bondTermYears: 1 }], ['bonds 20%, 1 year', { bondTarget: 0.2, bondTermYears: 1 }], ['bonds 20%, 3 years', { bondTarget: 0.2, bondTermYears: 3 }], ['bonds 30%, 3 years', { bondTarget: 0.3, bondTermYears: 3 }], ['bonds 20%, premium 2', { bondTarget: 0.2, bondPremium: 2 }]];
const LARGE = [['cap 0', { largeCap: 0 }], ['cap 15%', { largeCap: 0.15 }], ['cap 30%', { largeCap: 0.3 }], ['cap 50%', { largeCap: 0.5 }]];
const POOLS = [
  ['carry on at 14%', { capitalTarget: 0.14, capitalAction: 2 }], ['raise 300 at 14%', { capitalTarget: 0.14, capitalAction: 0, raiseAmount: 300 }],
  ['pool 25% best, at 14%', { capitalTarget: 0.14, capitalAction: 3 }, [['funding', { poolShare: 0.25, poolMode: 0 }]]], ['pool 50% best, at 14%', { capitalTarget: 0.14, capitalAction: 3 }, [['funding', { poolShare: 0.5, poolMode: 0 }]]],
  ['pool 25% worst, at 14%', { capitalTarget: 0.14, capitalAction: 3 }, [['funding', { poolShare: 0.25, poolMode: 1 }]]], ['pool 50% worst, at 14%', { capitalTarget: 0.14, capitalAction: 3 }, [['funding', { poolShare: 0.5, poolMode: 1 }]]],
];
for (const [flag, area, rows] of [['--bonds', 'funding', BONDS], ['--large', 'funding', LARGE], ['--pools', 'capital', POOLS]]) {
  if (require.main === module && process.argv.includes(flag)) {
    console.log('\n' + flag.slice(2));
    for (const [name, v, pre] of rows) { const r = areaRun(area, v, 'careful', [['credit', {}]].concat(pre || [])); console.log('  ' + name.padEnd(26) + 'mean profit ' + r.mean.toFixed(1).padStart(8) + '  cap breaches ' + r.breaches.toFixed(2) + '  rating score ' + r.score.toFixed(1) + ' (worst tenth ' + r.p10.toFixed(1) + ')' + (r.failed ? '  failed ' + r.failed : '')); }
  }
}
