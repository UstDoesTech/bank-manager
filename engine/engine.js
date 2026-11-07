/* ================= ENGINE (no DOM) ================= */
var S = null, OUT = null;
const ENGINE_VERSION = 2;
const AMP = 3;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function R(){ S.rs = (S.rs + 0x6D2B79F5) | 0; let t = S.rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
const rf = (a, b) => a + R() * (b - a);
const pick = a => a[Math.floor(R() * a.length)];
const chance = p => R() < p;
function wpick(list){ let t = 0; for (const [, w] of list) t += w; let r = R() * t; for (const [v, w] of list){ if ((r -= w) <= 0) return v; } return list[list.length - 1][0]; }
function gauss(m, s){ const u = R() || 1e-9, v = R(); return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function shuffle(a){ for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const logistic = z => 1 / (1 + Math.exp(-z));

/* money is held in £ thousands */
function fmt(k, sign){ const v = k * 1000, a = Math.abs(v); let s;
  if (a < 1000) s = '£' + Math.round(a);
  else if (a < 1e6) s = '£' + (a / 1000).toFixed(a < 1e4 ? 1 : 0) + 'k';
  else s = '£' + (a / 1e6).toFixed(2) + 'm';
  return (v < -0.5 ? '−' : (sign && v > 0.5 ? '+' : '')) + s; }
const full = k => '£' + Math.round(k * 1000).toLocaleString('en-GB');
const pc = (x, d = 1) => (x * 100).toFixed(d) + '%';
function annuity(L, rate, years){ const r = rate / 1200, n = years * 12; return L * r / (1 - Math.pow(1 + r, -n)); }

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const PATHS = {
  soft:     { name:'a soft landing',      rate:[4,4,4,3.75,3.75,3.75,3.75,3.5,3.5,3.5,3.25,3.25], u:[0,0.3], h:[0,4] },
  sticky:   { name:'sticky inflation',    rate:[4,4,4.5,4.5,4.5,5,5,5,5.25,5.25,5.25,5.25],       u:[0,1.2], h:[0,-7] },
  downturn: { name:'a recession',          rate:[4,4,4,4,4,3,3,3,2.5,2.5,2.25,2.25],             u:[0,2.7], h:[0,-12] },
  recovery: { name:'a recovery',           rate:[4,4,4,4,4.25,4.25,4.25,4.5,4.5,4.5,4.5,4.5],     u:[0,-1.0], h:[0,7] },
    stressRates: { name:'a rate shock', lossMult:1.5, rate:[4,4.5,5,5.5,6,6.25,6.5,6.5,6.5,6.5,6.5,6.5], uArr:[0,0.2,0.4,0.6,0.8,1,1.2,1.4,1.5,1.5,1.5,1.5], hArr:[-1,-2,-4,-6,-8,-10,-11,-12,-12,-12,-12,-12],
              mktArr:[-2,-3,-2,-4,-1,-3,0,0,0.5,0.5,0.5,0.5], infArr:[4,5,6,7,8,8,8,8,8,8,8,8] },
  // Only the stress test uses this: a severe recession, counted from the month the test starts (see pidx).
  stress:   { name:'a severe recession', lossMult:2.5,    rate:[4,3.5,3,2.5,2,1.75,1.5,1.5,1.5,1.5,1.5,1.5], uArr:[0.4,1,1.8,2.6,3.3,3.9,4.2,4.4,4.5,4.5,4.5,4.5], hArr:[-2,-5,-9,-13,-17,-20,-22,-23,-23,-23,-23,-23],
              mktArr:[-3,-6,-4,-8,-2,-5,-1,0,0.5,0.5,0.5,0.5], infArr:[2,1.8,1.6,1.4,1.2,1,1,1,1,1,1,1] },
};
// The stress path is indexed by months since the test began, not by the calendar month, so it can run across a year end.
const pidx = m => /^stress/.test(S.path) ? clamp(S.year * 12 + m - S.stressAbs, 0, 11) : m;
const KNAME = { mortgage:'mortgage', personal:'personal loan', card:'credit card', business:'business loan' };
const AMORT = { mortgage:0.003, personal:0.025, card:0.02, business:0.012 };
const FIRST = ['Ama','Tom','Priya','Callum','Mei','Joseph','Fatima','Ollie','Grace','Kwame','Sinead','Ravi','Ewa','Dylan','Hannah','Yusuf','Chloe','Mateusz','Aisha','George','Niamh','Arjun','Bethany','Leon','Sofia','Imran','Rosa','Theo','Zainab','Harry','Maya','Femi','Ellie','Kofi','Jade','Tomasz','Lucy','Omar','Ruth','Danny','Marcus','Ifeoma','Gareth','Lena'];
const LAST = ['Mensah','Hughes','Patel','Reid','Chen','Okafor','Khan','Walsh','Taylor','Boateng','Murphy','Shah','Nowak','Evans','Clarke','Ahmed','Wright','Kowalski','Hussain','Brooks','Byrne','Singh','Lloyd','Campbell','Rossi','Begum','Price','Owusu','Fraser','Adeyemi','Doyle','Lewandowski'];

function P(){ return S.path === 'sc' ? SCENARIOS[S.scenario].path : PATHS[S.path]; }
function ease(t){ t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
function unemp(m = S.month){ m = pidx(m); const p = P(); if (p.uArr) return clamp(S.y0.u + p.uArr[Math.min(11, m)], 3.4, 9.5); return clamp(S.y0.u + (p.u[1] - p.u[0]) * ease(m / 11), 3.6, 8.5); }
function hpi(m = S.month){ m = pidx(m); const p = P(); if (p.hArr) return S.y0.h * (1 + p.hArr[Math.min(11, m)] / 100); return S.y0.h * (1 + (p.h[0] + (p.h[1] - p.h[0]) * clamp(m / 11, 0, 1)) / 100); }
const INFL = { soft:2.0, sticky:4.6, downturn:1.4, recovery:2.3 };
function inflation(m = S.month){ m = pidx(m); const p = P(); if (p.infArr) return p.infArr[Math.min(11, m)]; const y0 = S.y0.inf != null ? S.y0.inf : 2.8; return y0 + ((INFL[S.path] != null ? INFL[S.path] : 2.5) - y0) * ease(m / 11); }
function hpiYr(m = S.month){ return hpi(m) / S.y0.h - 1; }
function rateAt(m){ m = pidx(m); if (P().abs) return P().rate[m]; let d = P().rate[m] - 4; if ((d < 0 && S.y0.base < 2.5) || (d > 0 && S.y0.base > 5.5)) d /= 2; return clamp(Math.round((S.y0.base + d) * 4) / 4, 0.25, 6.5); }
function collateral(l){ return l.prop * hpi() / (l.hpi0 || 1); }
function uf(){ return Math.pow(unemp() / 4.3, 1.8) * (P().lossMult || 1); }
function mkt(){ return Math.max(0.25, S.base - 1.5); }

/* balance sheet */
function giltBook(){ return S.gilts.reduce((a, g) => a + g.amt, 0); }
function giltYield(kind){ return S.base + (kind === 'long' ? 0.65 : 0.15); }
function giltMV(){ return S.gilts.reduce((a, g) => a + g.amt * (1 - g.dur * (giltYield(g.kind) - g.y0) / 100), 0); }
function loanSum(kind){ return S.loans.reduce((a, l) => a + ((!kind || l.kind === kind || (kind === 'retail' && (l.kind === 'personal' || l.kind === 'card'))) ? l.bal : 0), 0); }
/* Gilts are carried at cost. A player who owns treasury carries them at market value instead, so a fall in their value
   hits capital when rates rise, not only when they are sold. The difference is posted to the ledger as a revaluation. */
const fairValued = () => !!(S.policy && S.policy.owner.treasury === 'player');
function giltCarry(){ return fairValued() ? giltMV() : giltBook(); }
function syncGilts(){
  const d = giltCarry() - (S.ledger.bal.gilts || 0);
  if (Math.abs(d) > 1e-9) je('gilts.revalue', [['gilts', d], ['pl.gilts', -d]]);
}
function assets(){ return S.cash + giltCarry() + S.legacy + loanSum() + (S.retained || 0) + (S.collateral || 0); }
function capital(){ return assets() - S.deposits - S.cb - (S.wholesale || 0) - (S.bonds || 0); }
function rwa(){ let r = S.legacy * 0.75 + 1000 + aum() * 0.005 + (S.retained || 0) * 2; for (const l of S.loans) r += l.bal * (l.kind === 'mortgage' ? (l.ltv > 80 ? 0.5 : 0.35) : 1); return r; }
function capRatio(){ return capital() / rwa(); }
function liqRatio(){ return (S.cash + giltMV()) / (S.deposits + (S.wholesale || 0)); }
function metrics(){ return { profit: capital() - S.startCap + (S.divPaid || 0) - (S.injected || 0), cap: capRatio(), liq: liqRatio(), trust: S.trust, comp: S.comp, cash: S.cash }; }
function regStatus(){ return S.comp >= 70 ? ['Good', 'ok'] : S.comp >= 40 ? ['Watching', 'watch'] : ['Enforcement', 'alarm']; }
const MIN_CAP = 0.105, FAIL_CAP = 0.08, MIN_LIQ = 0.10;

function blankPL(){ return { intLoans:0, intGilts:0, intRes:0, intDep:0, intCB:0, fees:0, wealth:0, losses:0, redress:0, costs:0, gilts:0 }; }

/* outcome helpers */
function begin(){ OUT = { lines:[], chips:[], cust:null }; }
function custSay(t){ if (OUT) OUT.cust = t; }
function takeHome(incK){ return incK * 0.72 / 12; }
function minPayYears(balK, apr){ let b = balK * 1000, n = 0; const r = apr / 1200; while (b > 0.5 && n < 720){ const pay = Math.min(b * (1 + r), Math.max(b * r + b * 0.01, 25)); b = b * (1 + r) - pay; n++; } return n / 12; }
function say(t, tone){ if (OUT) OUT.lines.push({ t, tone: tone || '' }); }
function chip(t, c){ if (OUT) OUT.chips.push({ t, c }); }
/* ================= LEDGER =================
   Every change to a balance is a journal entry whose lines sum to zero. Lines are [account, signed amount]:
   positive = debit, negative = credit. Amounts are £ thousands (converted to whole pence when stored).
   Accounts: assets cash, gilts (book value), legacy, loans; liabilities deposits, cb (Bank of England);
   equity.opening, equity.paidin; income and expense pl.<key> (one per profit-and-loss line).
   S.ledger holds running balances only; entries are streamed to LEDGER_SINK (the game server stores them). */
var LEDGER_SINK = null, LEDGER_STRICT = false;
const LEDGER_DIR = { cash:1, legacy:1, deposits:-1, cb:-1, wholesale:-1, bonds:-1, retained:1, collateral:1 };   // accounts mirrored by a plain state field
function je(memo, lines, opts){
  let sum = 0; for (const l of lines) sum += l[1];
  if (!(Math.abs(sum) < 1e-6)){ if (LEDGER_STRICT) throw new Error('unbalanced journal entry ' + memo + ': ' + sum); }
  const L = S.ledger, ledgerOnly = opts && opts.ledgerOnly;
  for (const [a, d] of lines){
    L.bal[a] = (L.bal[a] || 0) + d;
    if (ledgerOnly) continue;
    if (a in LEDGER_DIR) S[a] += LEDGER_DIR[a] * d;
    else if (a.startsWith('pl.')) S.pl[a.slice(3)] -= d;
  }
  L.n++;
  if (LEDGER_SINK) LEDGER_SINK({ seq: L.n, year: S.year, month: S.month, memo, lines });
}
// Posts the current position as one opening entry; equity.opening is the balancing figure.
function openLedger(memo){
  if (!S.ledger) S.ledger = { bal:{}, n:0 };
  const a = [['cash', S.cash], ['gilts', giltBook()], ['legacy', S.legacy], ['loans', loanSum()], ['deposits', -S.deposits], ['cb', -S.cb]].concat(S.wholesale ? [['wholesale', -S.wholesale]] : [], S.bonds ? [['bonds', -S.bonds]] : [], S.retained ? [['retained', S.retained]] : []);
  je(memo || 'opening', a.concat([['equity.opening', -a.reduce((t, l) => t + l[1], 0)]]), { ledgerOnly:true });
}
// Compares the ledger with the live state; returns a list of problems (empty when everything agrees).
function ledgerCheck(){
  const L = S.ledger, bad = [], near = (x, y) => Math.abs(x - y) <= 1e-6 + 1e-9 * Math.abs(y);
  const chk = (n, ledger, live) => { if (!near(ledger, live)) bad.push(`${n}: ledger ${ledger} vs state ${live}`); };
  chk('cash', L.bal.cash || 0, S.cash); chk('legacy', L.bal.legacy || 0, S.legacy); chk('deposits', -(L.bal.deposits || 0), S.deposits); chk('cb', -(L.bal.cb || 0), S.cb); chk('wholesale', -(L.bal.wholesale || 0), S.wholesale || 0); chk('bonds', -(L.bal.bonds || 0), S.bonds || 0); chk('retained', L.bal.retained || 0, S.retained || 0);
  chk('gilts', L.bal.gilts || 0, giltCarry()); chk('loans', L.bal.loans || 0, loanSum()); chk('collateral', L.bal.collateral || 0, S.collateral || 0);
  const total = Object.values(L.bal).reduce((t, x) => t + x, 0);
  if (!near(total, 0)) bad.push('ledger does not sum to zero: ' + total);
  const eq = -Object.keys(L.bal).filter(a => a.startsWith('equity.') || a.startsWith('pl.')).reduce((t, a) => t + L.bal[a], 0);
  chk('equity', eq, capital());
  return bad;
}
function post(key, amt){ je('pl.' + key, [['cash', amt], ['pl.' + key, -amt]]); }
function money(key, amt, label){ post(key, amt); chip((label ? label + ' ' : '') + fmt(amt, true), amt >= 0 ? 'good' : 'bad'); }
function dT(d){ d = Math.round(d); if (!d) return; S.trust = clamp(S.trust + d, 0, 100); chip('Customers ' + (d > 0 ? '+' : '−') + Math.abs(d), d > 0 ? 'good' : 'bad'); }
function dC(d){ d = Math.round(d); if (!d) return; S.comp = clamp(S.comp + d, 0, 100); chip('Regulator ' + (d > 0 ? '+' : '−') + Math.abs(d), d > 0 ? 'good' : 'bad'); }
function depMove(x){ je('deposit.flow', [['cash', x], ['deposits', -x]]); chip('Deposits ' + fmt(x, true), x >= 0 ? 'good' : 'bad'); }
const fid = () => (S.fid = (S.fid || 0) + 1);
function later(n, data){ S.pending.push(Object.assign({ due: S.month + n }, data)); }
function person(a, b){ return { name: pick(FIRST) + ' ' + pick(LAST), age: ri(a, b), hue: Math.round(R() * 1000) / 1000 }; }
const first = n => n.split(' ')[0];
function sig(bad, good, badL, pg = 0.8, pb = 0.6){ if (S.tutorial && S.month === 0) return bad ? pick(badL) : pick(good); if (S.up && S.up.train){ pg += (1 - pg) * 0.7; pb += (1 - pb) * 0.6; } return bad ? (chance(pb) ? pick(badL) : pick(good)) : (chance(pg) ? pick(good) : pick(badL)); }
function F(l, v, t, wide){ return { l, v, t: t || null, w: !!wide }; }
function card(kind, o){ return Object.assign({ id: S.nextId++, kind, ref: String(140 + S.nextId).padStart(4, '0'), phys: false, fields: [], opts: [], h: {} }, o); }

function stake(earn, loss){ return F('Money at stake', `Earns +${full(earn)}/yr · default costs ~${full(Math.max(0.5, loss))}`, 'Money at stake', true); }
const RETAIN = { mortgage:0.1, personal:0.4, card:0.5, business:0.35 };
function news(w, head, body){ (S.news = S.news || []).push({ w, head, body: body || '', m: S.month }); }
function analyst(pd){ if (!S.up || !S.up.analyst) return null; const v = pd * Math.exp(gauss(0, 0.35)); return F('Analyst view', v < 0.02 ? 'Low risk' : v < 0.065 ? 'Medium risk' : 'High risk', 'Analyst view'); }
/* loans */
function book(o){
  const l = Object.assign({ id: S.nextId++, status: 'current', m0: S.month, carded: false, hpi0: hpi() }, o);
  je('loan.originate', [['loans', l.bal], ['cash', -l.bal]]); S.loans.push(l); S.stats.loans++; S.stats.lent += l.bal; if (l.hh != null) hhBooked(l);
  chip('Lent ' + fmt(l.bal), 'neutral');
  const kept = l.bal * (RETAIN[l.kind] || 0.2); je('deposit.created', [['cash', kept], ['deposits', -kept]]); chip('Deposit created ' + fmt(kept, true), 'neutral');
  if (!S.flags.seenCreate){ S.flags.seenCreate = true; say(`Lending created a new deposit of ${full(l.bal)} in the borrower's account. As they spend it, most moves to other banks and takes your reserves with it. ${full(kept)} is still with you.`); }
  return l;
}
function recovery(l){
  if (l.kind === 'mortgage') return Math.max(0, collateral(l) * 0.82 - 4);
  if (l.kind === 'business') return l.bal * Math.max(l.guar ? 0.62 : 0.3, l.ggs ? 0.7 : 0);
  return l.bal * 0.22;
}
function writeOff(l, rec){
  rec = clamp(rec, 0, l.bal); const loss = l.bal - rec;
  je('loan.writeoff', [['cash', rec], ['pl.losses', loss], ['loans', -l.bal]]); S.loans = S.loans.filter(x => x !== l); S.stats.defaults++; S.stats.losses += loss;
  return loss;
}
/* ---- system policy: the pricing and credit rules every bank starts with ----
   Every game has these from the first month and they reproduce how the branch game has always priced and judged.
   A player takes control of an area only when it is unlocked (progress.unlocked has 'pricing' / 'credit'); until then
   setPolicy is refused and the system values stay. owner says who set each area. */
function systemPolicy(){
  return {
    pricing: { mortgageSpread: 1.05, ltvAdd: [[90, 0.7], [85, 0.4], [75, 0.15]], mortgagePremium: 0.6, personalLow: 8.9, personalHigh: 18.9, cardRate: 24.9 },
    credit: { mortgageMaxLtv: 90, mortgageMaxLti: 5, mortgageMaxAff: 0.45, mortgageMinScore: 520, personalMinScore: 620, personalMaxDebtRatio: 0.5 },
    treasury: { liquidityTarget: 0.2, longShare: 0, hedgeTarget: 0, hedgeYears: 3 },
    funding: { boeTarget: 0, savingsSpread: 0, wholesaleTarget: 0, bondTarget: 0, bondTermYears: 1, bondPremium: 0.5, largeCap: 0, poolWhenShort: 0, poolShare: 0.25, poolMode: 0 },
    capital: { capitalTarget: 0.125, capitalAction: 0, raiseAmount: 300, dividendPayout: 0 },
    operations: { staffCounter: 6, staffCredit: 3, staffFraud: 4, staffFincrime: 3, staffComplaints: 3, staffIt: 3, overtime: 0, fraudSensitivity: 0.5, amlSensitivity: 0.5,
      coreMigration: 0, paymentsUpgrade: 0, regReporting: 0, mobileApp: 0, dataPlatform: 0, outsourceCards: 0, outsourceContact: 0, outsourceHosting: 0, oversight: 0 },
    owner: { pricing: 'system', credit: 'system', treasury: 'system', funding: 'system', capital: 'system', operations: 'system' } };
}
const POLICY_LIMITS = {
  pricing: { mortgageSpread: [0, 6], mortgagePremium: [0, 3], personalLow: [0, 40], personalHigh: [0, 40], cardRate: [0, 40] },
  credit: { mortgageMaxLtv: [50, 100], mortgageMaxLti: [2, 8], mortgageMaxAff: [0.2, 0.8], mortgageMinScore: [300, 900], personalMinScore: [300, 900], personalMaxDebtRatio: [0.2, 2] },
  treasury: { liquidityTarget: [0.1, 0.5], longShare: [0, 1], hedgeTarget: [0, 1.5], hedgeYears: [1, 5] },
  funding: { boeTarget: [0, 5000], savingsSpread: [-1.5, 2], wholesaleTarget: [0, 0.35], bondTarget: [0, 0.3], bondTermYears: [1, 3], bondPremium: [0, 2], largeCap: [0, 0.5], poolWhenShort: [0, 1], poolShare: [0.05, 0.5], poolMode: [0, 2] },
  capital: { capitalTarget: [0.105, 0.25], capitalAction: [0, 3], raiseAmount: [100, 1000], dividendPayout: [0, 1] },
  operations: { staffCounter: [1, 40], staffCredit: [1, 40], staffFraud: [1, 40], staffFincrime: [1, 40], staffComplaints: [1, 40], staffIt: [1, 40], overtime: [0, 1], fraudSensitivity: [0, 1], amlSensitivity: [0, 1],
    coreMigration: [0, 2], paymentsUpgrade: [0, 1], regReporting: [0, 1], mobileApp: [0, 1], dataPlatform: [0, 1], outsourceCards: [0, 1], outsourceContact: [0, 1], outsourceHosting: [0, 1], oversight: [0, 15] } };
// Prices above the system's lose customers and attract riskier ones; at or below the system's nothing changes.
// excess() is how many points a price is above the system price; dem() is the share of customers who still say yes;
// adv() scales default risk for the customers who do. No random draw happens at the system prices.
const excess = name => Math.max(0, S.policy.pricing[name] - systemPolicy().pricing[name]);
const dem = (ex, slope = 0.35) => ex <= 0 ? 1 : clamp(1 - slope * ex, 0.05, 1);
const adv = ex => 1 + 0.08 * ex;
const takeUp = (ex, slope) => ex <= 0 || chance(dem(ex, slope));
const MORTGAGE_SLOPE = 1.2;   // mortgage customers shop around hard: 0.5 points dearer loses about 40% of them
/* ---- unlocks: a strong year (rating A or better) hands over the next area, with a briefing letter from the board ---- */
const UNLOCK_ORDER = ['pricing', 'credit', 'treasury', 'funding', 'capital', 'operations'];
const STRONG = ['AAA', 'AA', 'A'];
const BRIEFING = {
  pricing: ['Pricing is yours', 'The board was impressed by your year. From now on you set the prices: the mortgage spread over Bank Rate, the personal loan rates and the card rate. Until today the executive team set them. Price too high and customers go elsewhere, and the ones who stay are riskier. Price too low and you give away margin. Open Policy from the menu to change them, or return to the executive team\'s prices at any time.'],
  treasury: ['Treasury is yours', 'A third strong year. You now set the treasury rules: how much cash the bank keeps as a share of deposits, and how much of any surplus goes into long gilts rather than short ones. Your treasurer follows the rules every month and will sell gilts to restore the cash target. From the day you take it over, gilts are counted at market value, so a fall in their value shows in your capital straight away instead of only when they are sold. Long gilts pay more but lose value when rates rise. A low cash target earns more and leaves less to meet a run.'],
  funding: ['Funding is yours', 'You now decide where the money comes from. Your savings rate is set as a gap to the market rate, and your funding team can also borrow from other banks (wholesale) up to a share of your deposits, in three-month loans that must be renewed. Wholesale money is dearer than savings and it can disappear: when markets freeze, nobody renews, and the money you were counting on has to be repaid. You can also issue fixed-term bonds for one to three years, which cannot leave early but must be repaid or refinanced when they mature, so watch for many falling due together. Large depositors such as housing associations and councils will offer big sums at a good rate, and one of them can take it all away at once, so set a cap on how much of your deposits they may hold. If liquidity runs short you can sell a pool of mortgages to investors: you get cash and free up capital, but you keep a slice of the risk and the first losses, and the price falls in a stressed market. Watch how much of your funding is wholesale and how much falls due soon.'],
  operations: ['Operations is yours', 'The board now hands you the running of the bank: how many people work in each team, how sensitive the fraud and money-laundering alerts are, which IT projects go ahead, and what to outsource. Until today the executive team ran it well. From now on every team has a capacity, and work beyond it becomes a backlog that ages into unhappy customers, upheld complaints, missed fraud and regulator fines. Hiring takes two months to arrive and a month to train. A very sensitive alert setting catches more crime but swamps your analysts with false alarms and blocks genuine customers. Too many projects at once overload your IT staff and bring outages. Outsourcing saves money but the regulator still holds you responsible when a supplier fails, unless you pay to oversee them. Watch utilisation and the age of your oldest cases: they show trouble months before the losses.'],
  capital: ['Capital is yours', 'You now set the capital rules: the ratio you want to stay above, what to do when you fall below it, how much to raise, and what share of each month\'s profit to pay out as dividends. Dividends please shareholders and the board, and they leave the bank with less capital. Paying them while thin on capital annoys the regulator. Raising shares dilutes the owners and lowers the return the board sees. Selling mortgages shrinks the bank. Carrying on risks the regulator.'],
  credit: ['Credit policy is yours', 'Another strong year. You now set the credit policy: how much of a home\'s price we lend, how many times income, how much of take-home pay a mortgage may take, and the lowest credit scores we accept. Loosening it wins customers and brings losses a year or two later.'] };
function grantUnlock(r){
  if (!STRONG.includes(r.letter)) return;
  const next = UNLOCK_ORDER.find(a => !S.progress.unlocked.includes(a));
  if (!next) return;
  S.progress.unlocked.push(next);
  addMail('The board', BRIEFING[next][0], BRIEFING[next][1], 'good', 0, S.year);
}
/* Quiet months: taking over an area starts three months with no scheduled shocks (a run on deposits, a market crash,
   an outage), so the player can see what their new rules do before anything goes wrong. Shocks that were due in the
   window move to the month after it. */
const QUIET_MONTHS = 3;
function quietUntil(){ return S.progress.quiet ? S.progress.quiet.until : 0; }
function quietLeft(){ return Math.max(0, quietUntil() - (S.year * 12 + S.month)); }
function applyQuiet(){
  const until = quietUntil(), base = S.year * 12;
  if (until <= base + S.month) return;
  const move = m => (m >= S.month && base + m < until) ? (until - base > 11 ? -1 : until - base) : m;
  S.sched.crash = move(S.sched.crash); S.sched.out = move(S.sched.out);
  S.sched.liq = S.sched.liq.map(move).filter(m => m >= 0);
}
function startQuiet(area){
  const mo = Math.min(S.month, 11);       // at the year-end screen the month is 12
  S.progress.quiet = { area, until: S.year * 12 + mo + 1 + QUIET_MONTHS };
  applyQuiet();
  addMail('The board', 'Three quiet months', `You have taken over ${area}. For the next three months nothing outside the bank will go wrong: no run on deposits, no market crash, no outage. Use the time to see what your new rules do.`, 'good', mo, S.year);
}
function setPolicy(area, values, release){
  const lim = POLICY_LIMITS[area];
  if (!lim) throw new Error('unknown policy area ' + area);
  if (!S.progress.unlocked.includes(area)) throw new Error(area + ' policy is not unlocked');
  if (release){ S.policy[area] = systemPolicy()[area]; S.policy.owner[area] = 'system'; if (area === 'treasury') syncGilts(); return S.policy[area]; }   // hand the area back to the executive team
  if (!values || typeof values !== 'object') throw new Error('no values');
  for (const [k, v] of Object.entries(values)){
    if (!lim[k]) throw new Error('unknown setting ' + k);
    if (typeof v !== 'number' || !isFinite(v) || v < lim[k][0] || v > lim[k][1]) throw new Error(k + ' must be between ' + lim[k][0] + ' and ' + lim[k][1]);
  }
  const first = S.policy.owner[area] !== 'player';
  Object.assign(S.policy[area], values); S.policy.owner[area] = 'player';
  if (area === 'treasury') syncGilts();
  if (first) startQuiet(area);
  return S.policy[area];
}
// What the credit policy says about an application: 'approve', 'refer' (a person should look) or 'decline'. It uses only
// what the applicant shows (their stated figures and credit score), never the hidden truth behind the case.
function policyVerdict(c){
  const cp = S.policy.credit, num = l => parseFloat(String(fv(c, l)).replace(/[^0-9.]/g, ''));
  if (c.kind === 'mortgage'){
    const h = c.h, m = mortgageRisk(h), score = num('Credit score'), lti = h.loan / h.inc;
    if (m.ltv > cp.mortgageMaxLtv || lti > cp.mortgageMaxLti || m.aff > cp.mortgageMaxAff || score < cp.mortgageMinScore || h.missed >= 3) return 'decline';
    if (m.ltv > cp.mortgageMaxLtv - 5 || lti > cp.mortgageMaxLti - 0.5 || m.aff > cp.mortgageMaxAff - 0.05 || score < cp.mortgageMinScore + 60 || h.missed >= 2) return 'refer';
    return 'approve';
  }
  if (c.kind === 'personal'){
    // debts plus this loan against a year's income; borrowing to clear an overdraft or other credit is a warning sign
    const score = num('Credit score'), debt = /None/.test(fv(c, 'Other debts')) ? 0 : num('Other debts');
    const ratio = (debt + num('Amount')) / num('Income') + (/overdraft|Consolidate/.test(c.who.sub || '') ? 0.1 : 0);
    if (score < cp.personalMinScore || ratio > cp.personalMaxDebtRatio) return 'decline';
    return score < cp.personalMinScore + 60 || ratio > cp.personalMaxDebtRatio - 0.1 ? 'refer' : 'approve';
  }
  return 'refer';
}

/* portfolio view: the named loans grouped into cohorts by product, risk band and month of issue. This is derived
   from S.loans and stored nowhere, so it cannot change how the game plays. Arrears buckets: current, 30 days
   (just fell behind), 60 days (second month), plan (on a payment plan). Nothing reaches 90+, because an account
   still in arrears after two months goes to recovery and is written off. */
const RISK_BANDS = [['low', 0.03], ['medium', 0.08], ['high', Infinity]];
const riskBand = pd => RISK_BANDS.find(b => pd < b[1])[0];
const loanRW = l => l.kind === 'mortgage' ? (l.ltv > 80 ? 0.5 : 0.35) : 1;
const arrearsBucket = l => l.status === 'plan' ? 'plan' : l.status === 'arrears' ? (S.month - l.since >= 1 ? 'd60' : 'd30') : 'current';
function portfolio(){
  const cohorts = new Map();
  for (const l of S.loans){
    const issued = S.year * 12 + l.m0, band = riskBand(l.pd), key = l.kind + '|' + band + '|' + issued;
    let c = cohorts.get(key);
    if (!c) cohorts.set(key, c = { key, product: l.kind, band, issued, n: 0, bal: 0, rateW: 0, pdW: 0, loss: 0, rwa: 0, buckets: { current: 0, d30: 0, d60: 0, plan: 0 } });
    c.n++; c.bal += l.bal; c.rateW += l.bal * l.rate; c.pdW += l.bal * l.pd; c.loss += l.pd * (l.bal - Math.min(l.bal, recovery(l))); c.rwa += l.bal * loanRW(l); c.buckets[arrearsBucket(l)] += l.bal;
  }
  return [...cohorts.values()].sort((a, b) => a.issued - b.issued || (a.key < b.key ? -1 : 1)).map(c => ({
    key: c.key, product: c.product, band: c.band, issued: c.issued, n: c.n, bal: c.bal, rate: c.rateW / c.bal, pd: c.pdW / c.bal,
    lgd: c.pdW > 0 ? c.loss / c.pdW : 0, expectedLoss: c.loss, rwa: c.rwa, buckets: c.buckets }));
}
function mRate(ltv){ const pr = S.policy.pricing, add = (pr.ltvAdd.find(b => ltv > b[0]) || [0, 0])[1]; return Math.round((S.base + pr.mortgageSpread + add) * 100) / 100; }

/* ============ CARD GENERATORS ============ */
const gen = {}, res = {};

gen.onboard = (o = {}) => {
  const bad = o.bad != null ? o.bad : chance(0.3), p = person(bad ? 18 : 19, bad ? 45 : 79), saver = o.saver != null ? o.saver : !bad && chance(0.38);
  const jobs = ['Nurse','Electrician','Teacher','Software developer','Chef','Accountant','Bus driver','Pharmacist','Plumber','Care worker','Hairdresser'].concat(p.age >= 60 ? ['Retired','Retired','Retired'] : [], p.age <= 24 ? ['Student','Student'] : []);
  const occ = sig(bad, jobs, p.age <= 26 ? ['Student','Between jobs','Gig worker'] : ['Between jobs','Gig worker','Director of a new company'], 0.9, 0.7);
  const id = sig(bad, ['Passed · passport','Passed · driving licence'], ['Passed · selfie retaken 5 times','Passed · passport issued 9 days ago']);
  const addr = sig(bad, ['Matches credit file','Matches electoral roll'], ['Same address as 7 recent applicants','No credit history at this address']);
  const dev = sig(bad, ['Phone in use for 3 years','Home broadband, usual area'], ['VPN, location hidden','Device used for 3 other applications']);
  const inflow = (bad && (o.bad || chance(0.7))) ? rf(9, 22) : rf(1.4, 4.6);
  const dep = bad ? rf(0.05, 0.6) : saver ? rf(8, 70) : rf(0.4, 9);
  const note = bad ? pick(['Wants the debit card sent as fast as possible.','Says a friend told them you open accounts quickly.','Asks whether there are limits on money coming in.','Moving from another bank, which closed their account.'])
    : saver ? pick(['Moving savings over from a building society.','Just sold a car and wants somewhere for the money.','Unhappy with their old bank\'s savings rate.'])
    : pick(['Wants an account for their salary.','New job in town, needs a local bank.','Moving from another bank, which closed their branch.','Wants a joint account later with a partner.']);
  return card('onboard', { label:'New customer', phys:true, who:{ ...p, sub: occ }, note,
    fields:[ F('Product', saver ? 'Easy-access saver' : 'Current account'), F('ID check', id, 'KYC'), F('Address check', addr), F('Device', dev), F('Expected in', full(inflow) + '/month'), F('First deposit', full(dep)) ],
    opts:[ { k:'open', l:'Open account', s:'go', st:'OPENED' }, { k:'docs', l:'Ask for documents', s:'alt', st:'PENDING' }, { k:'no', l:'Decline', s:'no', st:'DECLINED' } ],
    h:{ bad, dep, name: p.name } });
};
res.onboard = (c, k) => {
  const h = c.h, nm = first(h.name);
  const mule = () => later(ri(1, 3), { text:`${h.name}'s account was used as a money mule. Scam victims' money passed through it; you paid your share of their refunds.`, cash: -rf(6, 24) * 0.5, key:'redress', comp:-6, trust:-1, tone:'bad', fine:true, news:[3, 'Scam cash laundered through local bank accounts', `Police say money stolen from scam victims passed through an account opened at Counting House by ${h.name}.`] });
  const open = (d, text) => { depMove(d); S.stats.customers++; say(text); if (h.bad) mule(); else dT(1); };
  if (k === 'open') open(h.dep, `Account open. ${nm} leaves with a card on order.`);
  if (k === 'docs') {
    if (!h.bad){ if (chance(0.75)) open(h.dep * 0.9, `${nm} came back the next day with a payslip and a council tax bill. Account open.`); else { say(`${nm} didn't come back. Probably opened an account elsewhere.`); dT(-1); } }
    else if (chance(0.85)) { say(`${nm} never came back.`); later(0, { text:`The applicant who vanished after you asked ${nm} for documents was linked to a mule network.`, tone:'good' }); }
    else open(h.dep, `${nm} returned with a bank statement and a utility bill. Account open.`);
  }
  if (k === 'no'){
    say(`${nm} left without an account.`);
    if (h.bad) later(0, { text:`${h.name}'s details turned up in a fraud database. Declining was right.`, tone:'good', comp:1 });
    else { dT(-3); S.stats.wrongNo++; later(0, { text:`${h.name}, whom you declined, was genuine. They told friends you turned them away.`, tone:'bad' }); }
  }
};

gen.mortgage = (o = {}) => {
  const p = person(23, 54), joint = o.good ? true : chance(0.45);
  const inc = Math.round(joint ? rf(48, 140) : rf(26, 92));
  let price = Math.round(rf(185, 640) / 5) * 5;
  let depPct = o.good ? 25 : wpick([[5,2],[10,4],[15,3],[25,3],[40,1]]);
  let loan = Math.round(price * (1 - depPct / 100));
  if (loan / inc > 6.2) { price = Math.round(inc * 6 / (1 - depPct / 100) / 5) * 5; loan = Math.round(price * (1 - depPct / 100)); }
  if (o.good && loan / inc > 3.8){ price = Math.round(inc * 3.6 / 0.75 / 5) * 5; loan = Math.round(price * 0.75); }
  const score = o.good ? ri(860, 940) : Math.round(clamp(gauss(790, 115), 380, 999));
  const emp = o.good ? 'Permanent' : wpick([['Permanent',6],['Contractor',2],['Self-employed',2]]);
  const missed = o.good ? 0 : wpick([[0,8],[1,1.4],[3,0.8]]);
  const term = pick([25, 30, 35]);
  const sub = pick(['Nurse','Teacher','Civil servant','Electrician','Marketing manager','Paramedic','Engineer','Dentist','Shop manager','Data analyst','Lorry driver','Architect']);
  const h = { name:p.name, inc, price, loan, depPct, score, emp, missed, term, broker: !!S.flags.broker && chance(0.6), noise: o.good ? -0.6 : gauss(0, 0.7) };
  const m = mortgageRisk(h);
  const what = pick(['a two-bed flat','a three-bed semi','a terraced house','a new-build townhouse','a maisonette','a bungalow']);
  const opts = [{ k:'yes', l:`Approve at ${m.rate.toFixed(2)}%`, sub:'Market rate', s:'go', st:'APPROVED', cash: loan }, { k:'prem', l:`Approve at ${(m.rate + 0.6).toFixed(2)}%`, sub:'They may shop around', s:'go', st:'APPROVED', cash: loan }];
  const lti = loan / inc;
  if (lti > 4.5) { const nl = Math.round(inc * 4.5); opts.push({ k:'less', l:`Offer ${fmt(nl)}`, sub:'4.5× income', s:'alt', st:'COUNTER', cash: nl }); h.alt = nl; }
  else if (depPct < 15) { const nl = Math.round(price * 0.85); opts.push({ k:'less', l:'Ask for 15% deposit', s:'alt', st:'COUNTER', cash: nl }); h.alt = nl; }
  opts.push({ k:'no', l:'Decline', s:'no', st:'DECLINED' });
  return card('mortgage', { label:'Mortgage application', phys:true, who:{ ...p, sub }, note:`${h.broker ? 'Via a broker. ' : ''}${joint ? 'Buying with a partner' : 'Buying on their own'}: ${what}. Wants a ${pick([2,5])}-year fix over ${term} years.`,
    fields:[ F('Property price', full(price)), F('Loan', full(loan)), F('LTV', pc(1 - depPct / 100, 0), 'LTV'), F(joint ? 'Joint income' : 'Income', full(inc) + '/yr'),
      F('Loan to income', lti.toFixed(1) + '×', 'LTI'), F('Credit score', score + ' / 999', 'Credit score'), F('Repayment', `${full(m.pay)}/month · ${pc(m.aff, 0)} of take-home`, 'Affordability', true),
      F('Work', emp), F('Missed payments, 2 yrs', missed ? String(missed) : 'None'), F('Total interest', `${full(m.pay * term * 12 - loan)} over ${term} yrs · ${full(annuity(loan, m.rate, term - 10) * (term - 10) * 12 - loan)} over ${term - 10} yrs at ${full(annuity(loan, m.rate, term - 10))}/month`, 'Total interest', true), stake(loan * (m.rate - S.base) / 100, loan - (price * 0.82 - 4)), analyst(m.pd) ].filter(Boolean), opts, h });
};
function mortgageRisk(h, loan = h.loan){
  const ltv = loan / h.price * 100, rate = mRate(ltv), pay = annuity(loan, rate, h.term), aff = pay / (h.inc * 0.72 / 12), lti = loan / h.inc;
  const z = -4.6 + (720 - h.score) / 85 + Math.max(0, lti - 4) * 0.8 + Math.max(0, ltv - 80) / 7 + ({ Permanent:0, Contractor:0.4, 'Self-employed':0.6 })[h.emp] + h.missed * 0.55 + Math.max(0, aff - 0.35) * 9 + (h.noise || 0);
  return { ltv, rate, pay, aff, pd: logistic(z) };
}
res.mortgage = (c, k) => {
  const h = c.h, nm = first(h.name), spreadEx = excess('mortgageSpread');
  const doBook = (loan, extra = 0) => { const m = mortgageRisk(h, loan); { const pay = annuity(loan, m.rate + extra, h.term); custSay(`${full(pay)} a month at ${(m.rate + extra).toFixed(2)}%, ${pc(pay / takeHome(h.inc), 0)} of take-home pay. Over ${h.term} years they repay ${full(pay * h.term * 12)} for a ${full(loan)} loan, if the rate stayed the same.`); } book({ hh:h.hh, kind:'mortgage', name:h.name, bal:loan, rate:m.rate + extra, pd: Math.min(0.95, m.pd * (extra ? 1.25 : 1) * adv(spreadEx)), prop:h.price, ltv:m.ltv }); money('fees', 0.999 - (h.broker ? loan * 0.0035 : 0), h.broker ? 'Fee less broker' : 'Fee'); };
  if (k === 'yes'){ if (takeUp(spreadEx, MORTGAGE_SLOPE)){ doBook(h.loan); say(`Offer issued. ${nm} gets the keys next month.`); } else say(`${nm} found a cheaper mortgage at another lender.`); }
  if (k === 'prem'){ const pd = mortgageRisk(h).pd; if (chance(clamp(0.22 + pd * 4, 0.22, 0.9) * dem(spreadEx + excess('mortgagePremium'), MORTGAGE_SLOPE))) { doBook(h.loan, S.policy.pricing.mortgagePremium); say(`${nm} accepts the higher rate. ${pd > 0.05 ? 'Nobody else offered them anything.' : 'They didn\'t shop around.'}`); } else say(`${nm} found the market rate at another lender.`); }
  if (k === 'less'){ if (chance(0.45)) { doBook(h.alt); say(`${nm} found the extra deposit with help from family. Smaller loan agreed.`); } else { say(`${nm} took a bigger loan from another lender.`); dT(-1); } }
  if (k === 'no'){ say(`${nm} will try another lender.`); if (mortgageRisk(h).pd < 0.03) { dT(-1); S.stats.wrongNo++; } }
};

gen.personal = (o = {}) => {
  const p = person(20, 66), inc = Math.round(rf(18, 78) * 10) / 10, amt = o.risky ? 15 : pick([3, 5, 7.5, 10, 12, 15, 20, 25]);
  const purpose = pick(['New car','Kitchen refit','Wedding','Consolidate credit cards','Holiday','Boiler replacement','Pay off an overdraft','Van for work','Home extension']);
  const score = o.risky ? ri(520, 580) : Math.round(clamp(gauss(760, 130), 330, 999)), debt = Math.round((o.risky ? inc * 0.5 : rf(0, inc * 0.55)) * 10) / 10;
  const z0 = -3.4 + (720 - score) / 90 + (debt + amt) / inc * 2.0 + ((purpose === 'Consolidate credit cards') ? 0.4 : purpose === 'Pay off an overdraft' ? 0.7 : 0);
  const obBad = o.risky ? true : chance(clamp(logistic(z0 + 1.6), 0.08, 0.8));
  const pd = logistic(z0 + (obBad ? 1.2 : -0.3) + gauss(0, 0.5));
  const ob = (S.flags.ob || o.risky) ? (obBad ? pick(['Overdrawn 24 of the last 30 days','£680 on betting sites last month','Three payday loan repayments']) : pick(['Bills paid on time','Saves £150 a month','Same salary for 3 years'])) : 'Not checked';
  const yrs = pick([3, 4, 5]);
  return card('personal', { label:'Personal loan', phys:true, who:{ ...p, sub: purpose }, note: `Wants ${full(amt)} over ${yrs} years.`,
    fields:[ F('Amount', full(amt)), F('Income', full(inc) + '/yr'), F('Other debts', debt ? full(debt) : 'None'), F('Credit score', score + ' / 999', 'Credit score'), F('Spending insight', ob, 'Open banking', true), stake(amt * (S.policy.pricing.personalLow - S.base) / 100, amt * 0.78), analyst(pd) ].filter(Boolean),
    opts:[ { k:'low', l:`Approve at ${S.policy.pricing.personalLow}%`, sub:'Market rate', s:'go', st:'APPROVED', cash: amt }, { k:'high', l:`Approve at ${S.policy.pricing.personalHigh}%`, sub:'They may shop around', s:'alt', st:'APPROVED', cash: amt }, { k:'no', l:'Decline', s:'no', st:'DECLINED' } ],
    h:{ name:p.name, amt, pd, purpose, yrs, inc } });
};
res.personal = (c, k) => {
  const h = c.h, nm = first(h.name), pr = S.policy.pricing;
  const cv = r => { const yrs = h.yrs || 4, pay = annuity(h.amt, r, yrs), tot = pay * yrs * 12; custSay(`Over ${yrs} years at ${r}% they repay ${full(tot)} for ${full(h.amt)}: ${full(tot - h.amt)} in interest. Repayments take ${pc(pay / takeHome(h.inc || 30), 0)} of take-home pay.`); };
  if (k === 'low'){ if (takeUp(excess('personalLow'))){ cv(pr.personalLow); book({ hh:h.hh, kind:'personal', name:h.name, bal:h.amt, rate:pr.personalLow, pd:h.pd * adv(excess('personalLow')) }); say(`Money in ${nm}'s account within the hour.`); dT(h.pd < 0.08 ? 1 : 0); } else say(`${nm} took a cheaper loan from a lender down the road.`); }
  if (k === 'high'){ if (chance(clamp(0.25 + h.pd * 4, 0.25, 0.92) * dem(excess('personalHigh')))) { cv(pr.personalHigh); book({ hh:h.hh, kind:'personal', name:h.name, bal:h.amt, rate:pr.personalHigh, pd: Math.min(0.95, h.pd * 1.3 * adv(excess('personalHigh'))) }); say(`${nm} signs at ${pr.personalHigh}%.${h.pd > 0.08 ? ' Nobody else would lend to them.' : ''}`); if (h.pd < 0.06) dT(-1); } else say(`${nm} took ${pr.personalLow}% from a lender down the road.`); }
  if (k === 'no'){ say(`${nm} leaves. ${pick(['They mention a lender that advertises on daytime TV.','They will ask family instead.','They will try their old bank.'])}`); if (h.pd < 0.04) { dT(-1); S.stats.wrongNo++; } }
};

gen.card = () => {
  const p = person(21, 70), persist = chance(0.45), lim = pick([1.5, 2, 3, 4]), nl = lim * 2;
  const util = persist ? rf(0.86, 0.99) : rf(0.08, 0.5);
  const score = Math.round(clamp(gauss(persist ? 640 : 800, 80), 380, 999));
  const opts = [ { k:'up', l:`Raise to ${full(nl)}`, s:'go', st:'RAISED' }, { k:'keep', l:'Keep current limit', s:'neutral', st:'NO CHANGE' } ];
  if (persist) opts.push({ k:'plan', l:'Offer a repayment plan', s:'alt', st:'PLAN' });
  return card('card', { label:'Credit limit request', who:{ ...p, sub:'Requested in the app' }, note: persist ? 'Asked for a higher limit at 23:40 on a Sunday.' : 'Asked for a higher limit before a big purchase.',
    fields:[ F('Current limit', full(lim)), F('Balance', full(lim * util)), F('Repayments', persist ? 'Minimum only, 19 months' : pick(['Clears it most months','Well above minimum']), persist ? 'Persistent debt' : null), F('Credit score', score + ' / 999', 'Credit score'), F('Card rate', S.policy.pricing.cardRate + '% APR', null, true) ],
    opts, h:{ name:p.name, persist, lim, nl } });
};
res.card = (c, k) => {
  const h = c.h, nm = first(h.name);
  if (k === 'up'){
    const bal = (h.nl - h.lim) * (h.persist ? 0.9 : 0.25);
    custSay(`Carrying an extra ${full(bal)} at ${S.policy.pricing.cardRate}% costs about ${full(bal * S.policy.pricing.cardRate / 100)} a year in interest. Paying only the minimum, it would take about ${Math.round(minPayYears(bal, S.policy.pricing.cardRate))} years to clear.`);
    const cex = excess('cardRate'); book({ hh:h.hh, kind:'card', name:h.name, bal, rate:S.policy.pricing.cardRate, pd: (h.persist ? 0.32 : 0.025) * adv(cex) });
    if (cex > 0) later(ri(2, 4), { text:'Regulator review of your credit card pricing.', comp:-3, tone:'bad', p: Math.min(0.9, 0.12 * cex) });
    say(h.persist ? `Limit raised. ${nm} uses most of it within a fortnight.` : `Limit raised. ${nm} buys a sofa and pays most of it off.`);
    if (h.persist) later(ri(2, 4), { text:`Regulator file review: limits raised for customers in persistent debt, including ${h.name}.`, comp:-4, trust:-1, tone:'bad', p:0.4 });
  }
  if (k === 'keep'){ say(`Limit stays at ${full(h.lim)}.`); if (!h.persist) dT(-1); }
  if (k === 'plan'){ custSay(`A fixed plan clears the ${full(h.lim * 0.95)} balance in 4 years, instead of decades on minimum payments.`); say(`${nm} agrees to pay it down over 4 years at a lower rate.`); money('intLoans', -0.15, 'Interest given up'); dT(3); dC(1); }
};

gen.business = () => {
  const p = person(28, 64);
  const [type, sector] = pick([['Bakery','hospitality'],['Café','hospitality'],['Joinery','construction'],['Dental practice','health'],['Software studio','tech'],['Removals','transport'],['Florist','retail'],['Care home','care'],['Brewery','hospitality'],['Electrical contractors','construction'],['Bike shop','retail'],['Physio clinic','health']]);
  const biz = `${p.name.split(' ')[1]} ${type}`;
  const years = pick([1, 2, 4, 7, 12, 20]), turnover = Math.round(rf(250, 2800)), margin = rf(0.03, 0.18), profit = turnover * margin;
  const amt = Math.round(rf(80, 520) / 5) * 5, rate = Math.round((S.base + 4.4 + ({ hospitality:0.8, construction:0.6, tech:0.4, retail:0.5 }[sector] || 0)) * 10) / 10;
  const repay = annuity(amt, rate, 5) * 12, dscr = profit / repay;
  const purpose = pick(['A second site','New vans','Kitchen refit','New equipment','Working capital','Buy out a partner']);
  const z = -3.7 + (dscr < 1.25 ? (1.25 - dscr) * 3.2 : -(Math.min(dscr, 4) - 1.25) * 0.45) + (years < 3 ? 0.9 : years > 10 ? -0.3 : 0) + ({ hospitality:0.6, construction:0.5, tech:0.35, retail:0.3 }[sector] || 0) + (purpose === 'Working capital' ? 0.4 : 0) + gauss(0, 0.6);
  return card('business', { label:'Business loan', phys:true, who:{ ...p, sub: `Director, ${biz} Ltd` }, note:`${purpose}. Wants ${full(amt)} over 5 years at ${rate.toFixed(1)}%.`,
    fields:[ F('Trading for', years + (years === 1 ? ' year' : ' years')), F('Sector', sector[0].toUpperCase() + sector.slice(1)), F('Turnover', full(turnover) + '/yr'), F('Profit', full(profit) + '/yr'),
      F('Loan', full(amt)), F('Debt service cover', dscr.toFixed(2) + '×', 'DSCR'), stake(amt * (rate - S.base) / 100, amt * 0.7), analyst(logistic(z)) ].filter(Boolean),
    opts:[ { k:'yes', l:'Approve', s:'go', st:'APPROVED', cash: amt }, { k:'pg', l:'Approve with guarantee', sub:"Loss ~40% lower; they may walk", s:'alt', st:'APPROVED', cash: amt }, { k:'no', l:'Decline', s:'no', st:'DECLINED' } ],
    h:{ name:p.name, biz, amt, rate, pd: logistic(z), profit } });
};
res.business = (c, k) => {
  const h = c.h, nm = first(h.name);
  const doBook = g => { if (h.profit){ const yr = annuity(h.amt, h.rate, 5) * 12; custSay(`${h.biz} repays ${full(yr)} a year for 5 years, ${pc(yr / h.profit, 0)} of last year's profit. Total interest: ${full(yr * 5 - h.amt)}.${g ? ' If the business fails, the director could lose their home.' : ''}`); } book({ kind:'business', name:h.biz, bal:h.amt, rate:h.rate, pd:h.pd, guar:g, ggs: !!S.flags.ggs }); money('fees', h.amt * 0.015, 'Fee'); };
  if (k === 'yes'){ doBook(false); say(`${h.biz} gets the money. ${nm} shakes the cashier's hand.`); dT(1); }
  if (k === 'pg'){ if (chance(0.72)) { doBook(true); say(`${nm} signs a personal guarantee against the family home.`); } else { say(`${nm} wouldn't put the house on the line and walked.`); } }
  if (k === 'no'){ say(`${h.biz} will look elsewhere.`); if (h.pd < 0.04) { dT(-2); S.stats.wrongNo++; } }
};

gen.fraud = (o = {}) => {
  const p = person(19, 84), fraud = o.fraud != null ? o.fraud : chance(0.35), amt = Math.round(rf(0.08, 2.6) * 100) / 100;
  const merch = sig(fraud, ['Tesco, Croydon','Trainline','Currys, Reading','Boots','Deliveroo','Shell, M25 services','A hotel in Porto'], ['Online electronics store, Lithuania','Gift card website','Crypto exchange','Luxury watch site','Prepaid card top-up'], 0.85, 0.75);
  const where = sig(fraud, ['Where they usually shop','Abroad · flights booked on this card last week','Online · usual phone'], ['Used in Leeds and Lisbon 40 minutes apart','Abroad · no travel spending on record','Online · device never seen before']);
  const auth = sig(fraud, ['Approved in banking app','Chip and PIN'], ['No app approval attempted','Card number typed in by hand']);
  const tries = fraud && (o.fraud || chance(0.5)) ? '4 declines in 2 minutes' : 'First attempt';
  const fields = [ F('Merchant', merch, null, true), F('Amount', full(amt)), F('Usual spend', full(rf(0.02, 0.12)) + ' avg'), F('Location', where, null, true), F('Check', auth, '3-D Secure'), F('Attempts', tries) ];
  if (S.flags.fraudModel) fields.push(F('Model score', (fraud ? ri(56, 98) : ri(3, 64)) + ' / 100', 'Fraud model'));
  return card('fraud', { label:'Card fraud alert', who:{ ...p, sub: 'Debit card · ' + pick(['04:12','14:37','22:51','03:08','09:20','01:44']) }, note:'Held while you decide. The customer has not been contacted.',
    fields, opts:[ { k:'let', l:'Let it through', s:'go', st:'ALLOWED' }, { k:'block', l:'Block & text customer', s:'no', st:'BLOCKED' } ], h:{ name:p.name, fraud, amt } });
};
res.fraud = (c, k) => {
  const h = c.h, nm = first(h.name);
  if (k === 'let'){ if (h.fraud){ say(`It was fraud. ${nm} spotted it next morning. You refunded them in full.`, 'bad'); money('redress', -h.amt, 'Refund'); dT(-1); S.stats.fraudMiss++; } else say(`Genuine. ${nm} never knew it was held.`); }
  if (k === 'block'){ if (h.fraud){ say(`${nm} replied "NOT ME". New card on its way.`, 'good'); dT(2); S.stats.fraudStop++; } else { say(`It was ${nm}. The card was declined at the till.`, 'bad'); dT(-2); } }
};

gen.app = () => {
  const scam = chance(0.45), p = person(scam ? 30 : 28, scam ? 88 : 80), amt = Math.round(rf(1.5, 38) * 10) / 10;
  const why = scam ? pick(['Paying a builder','Moving money to a safe account','Investing in crypto','Paying a tax bill','Helping a friend overseas'])
                   : pick(['Paying a builder','Deposit on a car','Wedding venue balance','Gift to a grandchild','Solicitor for a house purchase']);
  const cop = sig(scam, ['Full match'], ['No match: different name','Close match'], 0.92, 0.7);
  const acct = sig(scam, ['Opened 9 years ago','Opened 4 years ago'], ['Opened 3 weeks ago','Opened 6 days ago']);
  const beh = sig(scam, ['Relaxed, chatting about the plans','Brought the invoice with them'], ['On the phone throughout, won\'t hang up','Says they were told not to tell the bank','Nervous, in a hurry']);
  return card('app', { label:'Payment in branch', phys:true, who:{ ...p, sub: `Customer for ${ri(2, 30)} years` }, note:`Wants to send ${full(amt)} today. Says it's for: ${why.toLowerCase()}.`,
    fields:[ F('Payee', chance(scam ? 0.9 : 0.6) ? 'New payee' : 'Paid before'), F('Name check', cop, 'Confirmation of Payee'), F('Receiving account', acct), F('Amount', full(amt)), F('Behaviour', beh, null, true) ],
    opts:[ { k:'send', l:'Send the payment', s:'go', st:'SENT' }, { k:'stop', l:'Pause & call police', sub:'Banking Protocol', s:'no', st:'PAUSED' } ], h:{ name:p.name, scam, amt } });
};
res.app = (c, k) => {
  const h = c.h, nm = first(h.name);
  if (k === 'send'){
    if (h.scam){ say(`It was a scam. ${nm} reported it a week later. You refunded them; the receiving bank paid half.`, 'bad'); money('redress', -h.amt / 2, 'Refund share'); dT(-2); S.stats.scamMiss++; news(3, `Scam victim lost ${fmt(h.amt)} after branch visit`, `${h.name} sent the money in person at Counting House. The bank has refunded them.`); }
    else { say(`Payment sent. ${nm} thanks the cashier.`); dT(1); }
  }
  if (k === 'stop'){
    if (h.scam){ say(`Police arrived within 20 minutes. The "adviser" on the phone hung up. ${nm} is shaken but keeps ${full(h.amt)}.`, 'good'); dT(4); S.stats.scamStop++; news(4, `Cashier stops customer losing ${fmt(h.amt)} to scam`, `Staff at Counting House called police when ${h.name}, ${c.who.age}, tried to send ${full(h.amt)} while on the phone to a fraudster.`); }
    else { say(`It was genuine. ${nm} sent it the next day and was not pleased about the wait.`, 'bad'); dT(-2); }
  }
};

gen.aml = (o = {}) => {
  const T0 = [
    { p:0.8, sub:'Personal account', text:'Nine cash deposits of £8,700 to £9,400 at four branches in three weeks.' },
    { p:0.85, sub:'Student account', text:'Received £14,200 from 11 different people. All of it left within hours for a crypto exchange.' },
    { p:0.6, sub:'Nail bar', text:'Takings went from £4k to £38k a month. All cash, almost no card payments.' },
    { p:0.5, sub:'Property purchase', text:'£410k for a flat, paid with funds from an overseas company.' },
    { p:0.15, sub:'Car dealership', text:'Cash deposits up 40% in March, the month new number plates come out.' },
    { p:0.12, sub:'Personal account', text:'£260k arrived from a solicitor\'s client account.' },
    { p:0.35, sub:'Personal account', text:'£75k from a UK crypto exchange. Customer once mentioned buying Bitcoin in 2017.' },
    { p:0.25, sub:'Takeaway', text:'Monthly cash deposits doubled since it started late-night delivery.' },
  ];
  const t = o.structuring ? T0[0] : pick(T0);
  const p = person(19, 70), guilty = o.structuring ? true : chance(t.p);
  const inc = sig(guilty, ['Matches deposits','Declared on account opening'], ['Declared income £19k/yr','No income declared'], 0.72, 0.55);
  return card('aml', { label:'Transaction monitoring', who:{ ...p, sub: t.sub }, note: t.text,
    fields:[ F('Account opened', sig(guilty, ['2009','2016','2012'], ['5 months ago','2 months ago'], 0.75, 0.5)), F('Income on file', inc), F('Linked accounts', sig(guilty, ['None flagged'], ['2 others flagged this year'], 0.85, 0.4)), F('Customer told?', 'No', 'Tipping off') ],
    opts:[ { k:'sar', l:'File a SAR', s:'alt', st:'REPORTED' }, { k:'ask', l:'Ask the customer', s:'neutral', st:'CALLED' }, { k:'exit', l:'Close account', s:'no', st:'CLOSED' }, { k:'none', l:'No action', s:'neutral', st:'CLEARED' } ],
    h:{ name:p.name, guilty } });
};
res.aml = (c, k) => {
  const h = c.h, nm = first(h.name);
  if (k === 'sar'){ S.stats.sars++; money('costs', -0.4, 'Review'); say('Report sent to the National Crime Agency. The account stays open and you keep watching.');
    if (h.guilty) later(ri(1, 3), { text:`Your report on ${h.name} fed a National Crime Agency investigation.`, comp:4, tone:'good' }); }
  if (k === 'ask'){ say(`${nm} had an explanation ready.`);
    if (h.guilty) later(1, { text:`After your call, ${h.name} emptied the account the same day. You may have tipped them off.`, comp:-12, tone:'bad' }); }
  if (k === 'exit'){ say(`Account closed. ${nm} has 60 days to move the money.`);
    if (h.guilty) later(1, { text:`${h.name}'s account was closed but no report filed. The regulator noted the gap.`, comp:-4, tone:'bad' });
    else { dT(-4); later(1, { text:`${h.name} was legitimate. They told the local paper they'd been debanked.`, trust:-2, tone:'bad', news:[5, '"They shut my account and wouldn\'t say why"', `${h.name}, a Counting House customer, says the bank closed their account without explanation. The bank said it could not comment on individual customers.`] }); } }
  if (k === 'none'){ say('Alert cleared.');
    if (h.guilty) later(ri(2, 5), { news:[7, 'Regulator finds bank missed money laundering', `A review found Counting House failed to report suspicious payments through an account belonging to ${h.name}.`], text:`Regulator review: you missed laundering through ${h.name}'s account.`, cash:-rf(50, 140), key:'redress', comp:-15, tone:'bad', p:0.75, fine:true }); }
};

gen.sanctions = () => {
  const p = person(30, 70), real = chance(0.28), amt = Math.round(rf(15, 240));
  const listName = p.name.split(' ')[0][0] + '. ' + p.name.split(' ')[1];
  return card('sanctions', { label:'Sanctions screening', who:{ ...p, sub:'Outgoing payment' }, note:`Screening flagged a ${full(amt)} payment against a name on the UK sanctions list: ${listName}.`,
    fields:[ F('Name match', (real ? ri(91, 100) : ri(82, 97)) + '%'), F('Date of birth', real ? (chance(0.8) ? 'Same as list' : 'Not on list') : (chance(0.25) ? 'Same as list' : pick(['Not on list','31 years apart','6 years apart']))), F('Nationality', real ? (chance(0.9) ? 'Same as list' : 'Not held') : pick(['Different','Same as list','Not held'])), F('Going to', real ? pick(['Trading company, Dubai','Holding company, Cyprus']) : pick(['Supplier, Birmingham','Family member, Spain','Trading company, Dubai'])) ],
    opts:[ { k:'release', l:'Release payment', s:'go', st:'RELEASED' }, { k:'hold', l:'Hold & ask for ID', s:'alt', st:'ON HOLD' }, { k:'freeze', l:'Freeze & report', sub:'to OFSI', s:'no', st:'FROZEN' } ], h:{ name:p.name, real, amt } });
};
res.sanctions = (c, k) => {
  const h = c.h, nm = first(h.name);
  if (k === 'release'){ say('Payment released.'); if (h.real) later(ri(1, 2), { news:[9, 'Bank fined for paying sanctioned individual', `The Office of Financial Sanctions Implementation penalised Counting House after it released ${full(h.amt)} to a person on the UK sanctions list.`], text:`OFSI: you released ${full(h.amt)} to a designated person. Penalty issued.`, cash:-rf(120, 300), key:'redress', comp:-25, tone:'bad', fine:true }); }
  if (k === 'hold'){ if (h.real){ say(`${nm} stopped replying. You froze the funds and reported them.`, 'good'); dC(2); } else { say(`${nm} sent a passport copy that cleared it. Payment went a day late.`); dT(-1); } }
  if (k === 'freeze'){ if (h.real){ say('OFSI confirmed the match. Funds stay frozen.', 'good'); dC(4); } else { say(`It wasn't them. The payment went two weeks late and ${nm} has complained.`, 'bad'); dT(-3); money('redress', -0.2, 'Goodwill'); } }
};

gen.hardship = l => {
  const reason = pick(['Lost their job','Hours cut at work','Relationship broke down','Long-term illness','New baby, one income for now','Trade has dried up']);
  const good = chance(0.5), vuln = chance(0.35);
  const fields = [ F('Loan', KNAME[l.kind]), F('Balance', full(l.bal)), F('Behind by', '2 payments'), F('Reason', reason), F('Outlook', good ? pick(['New job starts next month','Back to full hours soon']) : 'No change expected'), F('Vulnerability', vuln ? pick(['Carer for a parent','Recently bereaved','Struggling with mental health']) : 'None recorded') ];
  if (l.kind === 'mortgage') fields.splice(2, 0, F('Home worth now', full(collateral(l))));
  const opts = [ { k:'plan', l:'Agree a payment plan', s:'go', st:'PLAN', sub:'Forbearance' }, { k:'recover', l: l.kind === 'mortgage' ? 'Repossess' : 'Start recovery', s:'no', st: l.kind === 'mortgage' ? 'REPOSSESS' : 'RECOVERY' } ];
  if (l.kind !== 'mortgage') opts.push({ k:'sell', l:'Sell the debt', s:'alt', st:'SOLD', sub:'For about 40p in £1' });
  return card('hardship', { label:'Arrears', phys:true, who:{ name:l.name, age: ri(26, 66), hue: (l.id * 0.137) % 1, sub: KNAME[l.kind] + ' customer' }, note:`${first(l.name)} has missed two payments and has asked to talk.`, fields, opts, h:{ lid:l.id, good, vuln } });
};
res.hardship = (c, k) => {
  const h = c.h, l = S.loans.find(x => x.id === h.lid);
  if (!l){ say('The loan has already been dealt with.'); return; }
  const nm = first(l.name);
  if (k === 'plan'){ l.status = 'plan'; l.cure = h.good ? 0.4 : 0.14; say(`${nm} agrees to reduced payments for six months.`); dT(h.vuln ? 3 : 2); }
  if (k === 'recover' || k === 'sell') S.stats.harsh = (S.stats.harsh || 0) + (h.vuln ? 1 : 0);
  if (k === 'recover' && l.kind === 'mortgage') news(h.vuln ? 7 : 4, h.vuln ? 'Vulnerable homeowner evicted after bank refuses payment plan' : 'Bank repossesses family home', `Counting House took possession of ${first(l.name)}'s home after missed payments.`);
  if (k === 'recover'){ const loss = writeOff(l, recovery(l)); say(l.kind === 'mortgage' ? `The house is repossessed and sold at auction. Loss: ${fmt(loss)}.` : `Debt collectors take over. Loss: ${fmt(loss)}.`, 'bad'); chip('Loss ' + fmt(-loss), 'bad'); dT(h.vuln ? -7 : -3); if (h.vuln) dC(-5); }
  if (k === 'sell'){ const loss = writeOff(l, l.bal * 0.4); say(`Sold to a debt purchaser. ${nm} will now hear from them. Loss: ${fmt(loss)}.`); chip('Loss ' + fmt(-loss), 'bad'); dT(h.vuln ? -5 : -3); }
};

gen.rate = (old, nu) => {
  const d = nu - old, up = d > 0, s = S.savRate;
  const r2 = x => Math.max(0.1, Math.round(x * 100) / 100);
  return card('rate', { label:'Bank Rate decision', who:{ name:'Monetary Policy Committee', sub:'Bank of England', age:0, hue:0 }, note:`Bank Rate ${up ? 'rises' : 'falls'} from ${old.toFixed(2)}% to ${nu.toFixed(2)}%. Your older variable-rate loans reprice automatically. What do you pay savers?`,
    fields:[ F('Bank Rate', `${old.toFixed(2)}% → ${nu.toFixed(2)}%`, 'Bank Rate'), F('Your savings rate', s.toFixed(2) + '%'), F('Market average', `${Math.max(0.25, nu - 1.5).toFixed(2)}%`), F('Inflation', inflation().toFixed(1) + '%', 'Inflation'), F('Real return now', `${(s - inflation() >= 0 ? '+' : '')}${(s - inflation()).toFixed(1)}% a year`, 'Real return') ],
    opts:[ { k:'full', l:`Savings to ${r2(s + d).toFixed(2)}%`, sub:'Pass it all on', s:'alt', st:'SET' }, { k:'half', l:`Savings to ${r2(s + d / 2).toFixed(2)}%`, sub:'Pass on half', s:'alt', st:'SET' }, { k:'none', l:`Keep ${s.toFixed(2)}%`, sub:'No change', s:'neutral', st:'SET' } ],
    h:{ d, up } });
};
res.rate = (c, k) => {
  const h = c.h, before = S.savRate;
  S.savRate = Math.max(0.1, Math.round((S.savRate + (k === 'full' ? h.d : k === 'half' ? h.d / 2 : 0)) * 100) / 100);
  say(`Savings rate now ${S.savRate.toFixed(2)}%.`);
  if (h.up){ if (k === 'none') S.stats.stingy = (S.stats.stingy || 0) + 1; if (k === 'full') dT(2); if (k === 'half') dT(-1); if (k === 'none') { dT(-3); later(2, { text:'Consumer groups name you among banks slowest to pass on rate rises.', comp:-3, tone:'bad', p:0.5 }); } }
  else { if (k === 'full') dT(-1); if (k === 'none') dT(1); }
  if (S.savRate !== before) chip(`Savings ${before.toFixed(2)}→${S.savRate.toFixed(2)}%`, 'neutral');
};

gen.treasury = () => {
  S.lastTreasury = S.month;
  const amt = Math.max(500, Math.floor((S.cash - 0.2 * S.deposits) * 0.6 / 250) * 250);
  const ys = giltYield('short'), yl = giltYield('long');
  return card('treasury', { label:'Treasury', who:{ name:'Your treasurer', sub:'Liquidity desk', age:0, hue:0 }, note:`You have ${full(amt)} of spare cash. Where should it sit?`,
    fields:[ F('Bank Rate', S.base.toFixed(2) + '%', 'Bank Rate'), F('2-year gilt', ys.toFixed(2) + '%', 'Gilts'), F('10-year gilt', yl.toFixed(2) + '%', 'Gilts'), F('Cash on hand', full(S.cash)) ],
    opts:[ { k:'short', l:'Buy 2-year gilts', sub: ys.toFixed(2) + '%', s:'alt', st:'BOUGHT', cash: amt }, { k:'long', l:'Buy 10-year gilts', sub: yl.toFixed(2) + '%', s:'go', st:'BOUGHT', cash: amt }, { k:'cash', l:'Keep as reserves', sub: S.base.toFixed(2) + '%', s:'neutral', st:'HELD' } ],
    h:{ amt } });
};
res.treasury = (c, k) => {
  const amt = c.h.amt;
  if (k === 'cash'){ say('Cash stays at the Bank of England, earning Bank Rate.'); return; }
  const y = giltYield(k);
  je('gilts.buy', [['gilts', amt], ['cash', -amt]]); S.gilts.push({ kind:k, amt, coupon:y, dur: k === 'long' ? 8.2 : 1.9, y0:y });
  chip(`Gilts +${fmt(amt)}`, 'neutral'); say(`Bought ${full(amt)} of ${k === 'long' ? '10' : '2'}-year gilts at ${y.toFixed(2)}%.`);
};

function sellGilts(){ const mv = giltMV(), bk = giltCarry(); je('gilts.sell', [['cash', mv], ['gilts', -bk], ['pl.gilts', bk - mv]]); S.gilts = []; if (mv - bk < -0.5) S.stats.giltLoss = (S.stats.giltLoss || 0) + 1; return mv - bk; }
gen.liqshock = () => {
  const out = Math.round(S.deposits * rf(0.07, 0.13) * (1.4 - S.trust / 100) * (P().liqMult || 1));
  const t = pick([
    { who:'Social media', note:'A post claiming you are about to fail has 40,000 shares. Savers are queuing to withdraw.' },
    { who:'Hartley Housing Association', note:'Your largest depositor is moving its money to a bigger bank.' },
    { who:'A rival bank', note:'A rival is paying 5.1% on easy-access savings. Money is leaving.' },
  ]);
  const opts = [ { k:'pay', l:'Pay them out', sub:'From cash', s:'neutral', st:'PAID' }, { k:'raise', l:'Raise savings rate 0.5%', sub:'Keeps most of it', s:'go', st:'RATE UP' } ];
  if (S.gilts.length) opts.push({ k:'gilts', l:'Sell gilts', sub: `Market value ${full(giltMV())}`, s:'alt', st:'SOLD' });
  opts.push({ k:'boe', l:'Borrow from the Bank', sub:'Bank of England', s:'alt', st:'BORROWED' });
  return card('liqshock', { label:'Funding alert', who:{ name:t.who, sub:'Deposits leaving', age:0, hue:0 }, note:t.note,
    fields:[ F('Outflow', full(out)), F('Cash on hand', full(S.cash)), F('Liquidity', pc(liqRatio()), 'Liquidity'), F('Gilts', S.gilts.length ? `${full(giltBook())} cost · ${full(giltMV())} now` : 'None', 'Gilts', true) ], opts, h:{ out } });
};
res.liqshock = (c, k) => {
  let out = c.h.out;
  if (k === 'raise'){ out = Math.round(out * 0.35); S.savRate = Math.round((S.savRate + 0.5) * 100) / 100; chip(`Savings ${S.savRate.toFixed(2)}%`, 'neutral'); say(`Most savers stay for the better rate. ${full(out)} still leaves.`); }
  depMove(-out);
  if (k === 'pay') say(`${full(out)} paid out from reserves.`);
  if (k === 'gilts'){ const g = sellGilts(); say(`Gilts sold. ${g < -0.5 ? `Rates have moved since you bought them: a ${fmt(-g)} loss is now real.` : 'Sold at about what you paid.'}`, g < -0.5 ? 'bad' : ''); if (Math.abs(g) > 0.5) chip('Gilt sale ' + fmt(g, true), g >= 0 ? 'good' : 'bad'); }
  if (k === 'boe'){ je('boe.draw', [['cash', out], ['cb', -out]]); S.stats.boe++; chip('Bank of England loan ' + fmt(out), 'neutral'); say(`The Bank of England lends you ${full(out)} against your loan book, at Bank Rate plus 1%.`); }
};

gen.funding = () => {
  const need = Math.round(S.deposits * 0.06);
  return card('funding', { label:'Funding', who:{ name:'Your treasurer', sub:'Liquidity desk', age:0, hue:0 }, note:`Liquidity is down to ${pc(liqRatio())}. The regulator expects at least ${pc(MIN_LIQ, 0)}. You need more funding to keep lending.`,
    fields:[ F('Liquidity', pc(liqRatio()), 'Liquidity'), F('Cash on hand', full(S.cash)), F('Savings rate', S.savRate.toFixed(2) + '%'), F('Market average', mkt().toFixed(2) + '%') ],
    opts:[ { k:'raise', l:'Raise savings rate 0.4%', s:'go', st:'RATE UP' }, { k:'bond', l:'Fixed-rate bond campaign', sub:`Raise ~${fmt(need)}, cost ${fmt(15)}`, s:'alt', st:'LAUNCHED' }, { k:'boe', l:`Borrow ${fmt(need)}`, sub:'Bank of England', s:'neutral', st:'BORROWED' }, { k:'none', l:'Do nothing', s:'no', st:'NOTED' } ], h:{ need } });
};
res.funding = (c, k) => {
  const need = c.h.need;
  if (k === 'raise'){ S.savRate = Math.round((S.savRate + 0.4) * 100) / 100; say(`Savings rate now ${S.savRate.toFixed(2)}%. New money should follow over the coming months.`); chip(`Savings ${S.savRate.toFixed(2)}%`, 'neutral'); }
  if (k === 'bond'){ money('costs', -15, 'Marketing'); depMove(need); S.savRate = Math.round((S.savRate + 0.15) * 100) / 100; say('Savers lock in for a year. Your average funding cost edges up.'); }
  if (k === 'boe'){ je('boe.draw', [['cash', need], ['cb', -need]]); S.stats.boe++; chip('Bank of England loan ' + fmt(need), 'neutral'); say('Borrowed at Bank Rate plus 1%. Repaid automatically when liquidity recovers.'); }
  if (k === 'none') say('No change.');
};

const PRODUCTS = {
  fraudModel: () => ({ who:'A fraud-tech vendor', note:'Offers a machine-learning model that scores every card payment for fraud.', fields:[ F('Cost', full(60)), F('You get', 'A score on every fraud alert', null, true) ], opts:[ { k:'buy', l:`Buy it (${fmt(60)})`, s:'go', st:'BOUGHT' }, { k:'no', l:'Not now', s:'neutral', st:'PASSED' } ] }),
  ob: () => ({ who:'Your credit team', note:'Wants open banking checks on loan applicants: a look at real spending, with consent.', fields:[ F('Cost', full(35)), F('You get', 'Spending insight on loan applications', 'Open banking', true) ], opts:[ { k:'buy', l:`Buy it (${fmt(35)})`, s:'go', st:'BOUGHT' }, { k:'no', l:'Not now', s:'neutral', st:'PASSED' } ] }),
  od: () => ({ who:'Your product team', note:'Proposes a £6-a-day fee for going overdrawn without an arranged overdraft.', fields:[ F('Expected income', full(7) + '/month'), F('Who pays it', 'Mostly customers already short of money', null, true) ], opts:[ { k:'buy', l:'Launch the fee', s:'go', st:'LAUNCHED' }, { k:'no', l:'Reject it', s:'no', st:'REJECTED' } ] }),
  branch: () => ({ who:'Your finance director', note:'Wants to close the Hartley Green branch, the last bank in town. Mostly older customers use it.', fields:[ F('Saving if closed', full(10) + '/month'), F('Banking hub instead', `${full(20)} once, saves ${full(6)}/month`, null, true) ], opts:[ { k:'close', l:'Close it', s:'no', st:'CLOSED' }, { k:'hub', l:'Move to a banking hub', s:'alt', st:'HUB' }, { k:'keep', l:'Keep it open', s:'go', st:'OPEN' } ] }),
  cyber: () => ({ who:'Your IT director', note:'Asks for budget to make card payments and the app more resilient.', fields:[ F('Cost', full(50)), F('You get', 'Shorter, smaller outages', null, true) ], opts:[ { k:'buy', l:`Approve (${fmt(50)})`, s:'go', st:'APPROVED' }, { k:'no', l:'Not now', s:'neutral', st:'PASSED' } ] }),
  broker: () => ({ who:'A mortgage broker network', note:'Offers to send you applications from its 400 advisers. You pay them 0.35% of every mortgage they introduce.', fields:[ F('You get', 'About twice as many mortgage applications', null, true), F('Cost', '0.35% per mortgage') ], opts:[ { k:'buy', l:'Sign up', s:'go', st:'SIGNED' }, { k:'no', l:'Not now', s:'neutral', st:'PASSED' } ] }),
  ggs: () => ({ who:'British Business Bank', note:'Invites you to lend under a government guarantee scheme. It covers 70% of losses on new business loans.', fields:[ F('Set-up cost', full(12)), F('You get', '70% of business-loan losses covered', null, true) ], opts:[ { k:'buy', l:`Join (${fmt(12)})`, s:'go', st:'JOINED' }, { k:'no', l:'Not now', s:'neutral', st:'PASSED' } ] }),
  campaign: () => ({ who:'Your marketing team', note:'Wants to run a savings campaign: 1-year fixed bond at 0.6% above your easy-access rate.', fields:[ F('Cost', full(18)), F('Expected deposits', '+6%') ], opts:[ { k:'buy', l:'Run it', s:'go', st:'LAUNCHED' }, { k:'no', l:'Not now', s:'neutral', st:'PASSED' } ] }),
};
gen.product = () => {
  const key = S.prodOrder.find(k => !S.prodUsed.includes(k) && !((k === 'fraudModel' || k === 'ob') && S.flags[k])); if (!key) return null; S.prodUsed.push(key);
  const p = PRODUCTS[key]();
  return card('product', { label:'Proposal', who:{ name:p.who, sub:'Needs your sign-off', age:0, hue:0 }, note:p.note, fields:p.fields, opts:p.opts, h:{ key } });
};
res.product = (c, k) => {
  const key = c.h.key;
  if (key === 'fraudModel' && k === 'buy'){ money('costs', -60, 'Cost'); S.flags.fraudModel = true; say('Fraud alerts now come with a model score.'); }
  if (key === 'ob' && k === 'buy'){ money('costs', -35, 'Cost'); S.flags.ob = true; say('Loan applications now show spending insight.'); }
  if (key === 'broker' && k === 'buy'){ S.flags.broker = true; say('Broker applications start arriving next month.'); }
  if (key === 'ggs' && k === 'buy'){ money('costs', -12, 'Cost'); S.flags.ggs = true; say('New business loans are now 70% guaranteed.'); }
  if (key === 'cyber' && k === 'buy'){ money('costs', -50, 'Cost'); S.flags.cyber = true; say('Systems hardened.'); }
  if (key === 'campaign' && k === 'buy'){ money('costs', -18, 'Cost'); depMove(Math.round(S.deposits * 0.06)); S.savRate = Math.round((S.savRate + 0.12) * 100) / 100; say('Savers lock in for a year.'); }
  if (key === 'od' && k === 'buy'){ S.flags.od = S.month; S.flags.odTotal = 0; say('Fee goes live next month.'); }
  if (key === 'od' && k === 'no'){ say('Fee rejected.'); dT(1); }
  if (key === 'branch'){
    if (k === 'close'){ news(7, 'Last bank in Hartley Green to close', 'Older residents say they will have to travel to the next town to bank.'); S.flags.branch = 'closed'; depMove(-Math.round(S.deposits * 0.02)); dT(-6); say('Branch closed. Some older customers move their savings to the building society down the road.'); }
    if (k === 'hub'){ S.flags.branch = 'hub'; money('costs', -20, 'Fit-out'); dT(-1); say('Counter service moves into the shared banking hub on the high street.'); }
    if (k === 'keep'){ dT(1); say('Branch stays open.'); news(2, 'Counting House promises to keep Hartley Green branch', 'The town keeps its last bank counter.'); }
  }
  if (k === 'no' && key !== 'od') say('Parked for now.');
};

gen.outage = () => {
  const big = !S.flags.cyber, cost = big ? Math.round(rf(20, 40)) : Math.round(rf(3, 8));
  return card('outage', { label:'Incident', who:{ name:'Operations', sub:'Card payments', age:0, hue:0 }, note: big ? 'Card payments failed for 6 hours on Saturday. People were stuck at tills and petrol stations.' : 'Card payments failed for 40 minutes on Saturday. Your backup systems kicked in.',
    fields:[ F('Customers affected', big ? '11,400' : '900'), F('Compensation', full(cost)) ],
    opts:[ { k:'pay', l:'Compensate customers', s:'go', st:'PAID' }, { k:'sorry', l:'Apologise only', s:'no', st:'NOTED' } ], h:{ cost, big } });
};
res.outage = (c, k) => {
  const h = c.h;
  if (k === 'pay'){ money('redress', -h.cost, 'Compensation'); say('Credits land in accounts by Monday.'); dT(h.big ? 1 : 0); }
  else { say('Apology posted on the website.'); dT(h.big ? -6 : -2); if (h.big){ dC(-3); news(5, 'Card failure leaves shoppers stranded', 'Counting House customers could not pay for six hours. The bank has apologised but offered no compensation.'); } }
};

gen.complaint = () => {
  const p = person(22, 85), valid = chance(0.68);
  const t = valid ? pick([
      { text:'Charged £180 in overdraft fees while in hospital. Says they called to warn you.', ev:'Call notes confirm the hospital stay', amt:0.18 },
      { text:'A payment you delayed for checks cost them their place in a house chain.', ev:'Check took 4 days; the target is 1', amt:0.6 },
      { text:'Sold a packaged account with travel insurance they could never claim on, due to age.', ev:'Policy excludes over-80s; customer is 83', amt:0.4 },
    ]) : pick([
      { text:'Wants £5,000 because the app was slow on Tuesday.', ev:'App response normal on Tuesday', amt:0.05 },
      { text:'Says you closed their savings account without warning.', ev:'Letters sent in March and May; signed for', amt:0.25 },
      { text:'Disputes a card payment at a restaurant.', ev:'Chip and PIN, phone in the restaurant at the time', amt:0.09 },
    ]);
  return card('complaint', { label:'Complaint', who:{ ...p, sub:'Formal complaint' }, note:t.text, fields:[ F('Evidence', t.ev, null, true), F('Claim', full(t.amt)) ],
    opts:[ { k:'good', l:'Uphold + goodwill', sub:`${full(t.amt + 0.15)}`, s:'go', st:'UPHELD' }, { k:'refund', l:'Refund only', sub:full(t.amt), s:'alt', st:'UPHELD' }, { k:'reject', l:'Reject', s:'no', st:'REJECTED' } ], h:{ name:p.name, valid, amt:t.amt } });
};
res.complaint = (c, k) => {
  const h = c.h, nm = first(h.name);
  if (k === 'good'){ money('redress', -(h.amt + 0.15)); say(`${nm} writes back to say thank you.`); dT(h.valid ? 2 : 0); }
  if (k === 'refund'){ money('redress', -h.amt); say(`Refunded. ${nm} accepts.`); dT(h.valid ? 1 : 0); }
  if (k === 'reject'){
    if (h.valid){ say(`${nm} takes it to the Financial Ombudsman.`); later(ri(1, 2), { text:`The Ombudsman upheld ${h.name}'s complaint. You pay the claim, interest and a case fee.`, cash: -(h.amt + 0.75), key:'redress', trust:-3, comp:-1, tone:'bad' }); }
    else say(`${nm} accepts the decision.`);
  }
};


/* ============ WEALTH MANAGEMENT ============ */
const LEVELS = ['cautious', 'balanced', 'adventurous'], EQ = { cautious:0.25, balanced:0.6, adventurous:0.9 }, STD_FEE = 0.85, HOUSE_FEE = 1.2;
function aum(){ return S.wm ? S.wm.clients.reduce((a, c) => a + c.amt, 0) : 0; }
function mktMean(m){ m = pidx(m); if (P().mktArr) return P().mktArr[m]; return S.path === 'downturn' ? (m < 6 ? -2.2 : 1.0) : ({ soft:0.7, sticky:-0.4, recovery:1.3 })[S.path]; }
function addClient(o){ S.wm.clients.push(Object.assign({ mis:0, house: !!S.wm.houseNew, peak:o.amt }, o)); S.wm.won++; }

gen.wmLaunch = () => card('wmLaunch', { label:'Proposal', who:{ name:'Your board', sub:'Strategy', age:0, hue:0 }, note:'Customers with savings keep asking where to invest. Should you start managing money for them?',
  fields:[ F('Build a team', `${full(20)} to set up, ${full(2.5)}/month`, null, true), F('Buy Harwood Wealth', `${full(120)}. Brings ${full(15000)} of client assets; ${full(5)}/month`, 'Client assets', true), F('Ongoing fee', STD_FEE.toFixed(2) + '% a year on client assets', 'Ongoing fee', true) ],
  opts:[ { k:'build', l:'Build a team', s:'go', st:'LAUNCHED' }, { k:'buy', l:'Buy Harwood Wealth', s:'alt', st:'ACQUIRED' }, { k:'no', l:'Not now', s:'neutral', st:'PARKED' } ] });
res.wmLaunch = (c, k) => {
  const m = S.month;
  if (k === 'no'){ S.wmOffer = m + 5 <= 11 ? m + 5 : -1; say('Parked. The board will raise it again.'); return; }
  S.wm = { clients:[], cost: k === 'buy' ? 5 : 2.5, won:0, houseNew:false, houseExtra:0, houseAt: Math.min(m + 2, 11), campAt: Math.min(m + 4, 11), calm:-1, cashUntil:-1, start:S.year };
  if (k === 'build'){ money('costs', -20, 'Set-up'); say('Two advisers start next week in a corner of the banking hall.'); }
  else {
    money('costs', -120, 'Acquisition'); addClient({ name:'Harwood Wealth clients', amt:15000, put:'balanced', suit:1, block:true }); S.wm.won = 0;
    chip('Client assets +' + fmt(15000), 'good'); say('Harwood\'s 120 clients and their advisers move across.');
    later(ri(3, 8), { text:'A review of Harwood\'s past advice found pension transfers that didn\'t suit the clients. You inherited the bill.', cash:-rf(40, 110), key:'redress', comp:-5, trust:-1, tone:'bad', p:0.5, fine:true });
  }
};

const GROWTH = { cautious:3, balanced:4.5, adventurous:6 };
function wmFee(){ return S.wm && S.wm.houseNew ? HOUSE_FEE : STD_FEE; }
function growthLine(amt, g, n){ const fee = wmFee(), fv = amt * Math.pow(1 + (g - fee) / 100, n), cheap = amt * Math.pow(1 + (g - 0.2) / 100, n); return `${full(fv)} after ${n} years · our ${fee.toFixed(2)}% fee costs ${full(cheap - fv)} against a 0.2% tracker fund`; }
gen.wmClient = () => {
  const p = person(34, 84), amt = Math.round(rf(100, 2000) / 5) * 5;
  const horizon = pick([2, 5, 10, 20]);
  const goal = horizon === 2 ? pick(['House deposit for a child','Paying off the mortgage','Care home fees soon']) : pick(['Income in retirement','Grandchildren\'s university','Grow an inheritance','Proceeds of a business sale']);
  const cap = horizon === 2 ? 0 : pick([0, 1, 2]);
  const atr = pick([0, 1, 2]);
  const suit = Math.min(atr, cap, horizon <= 2 ? 0 : horizon <= 5 ? 1 : 2);
  const capTxt = ['This is most of what they have','Some savings and a workplace pension','Final-salary pension and a paid-off house'][cap];
  return card('wmClient', { label:'Wealth client', phys:true, who:{ ...p, sub: goal }, note:`Wants to invest ${full(amt)}. Your adviser has finished the fact-find.`,
    fields:[ F('Investing', full(amt)), F('Needs it in', horizon + ' years'), F('Risk questionnaire', ['Cautious','Balanced','Adventurous'][atr], 'Attitude to risk'), F('Experience', pick(['Invested for 20 years','First time investing','Has an ISA, nothing else'])), F('Other assets', capTxt, 'Capacity for loss', true), F('If balanced, 4.5% a year', growthLine(amt, 4.5, horizon), 'Growth illustration', true) ],
    opts:[ { k:'cautious', l:'Cautious', sub:'25% shares', s:'alt', st:'CAUTIOUS' }, { k:'balanced', l:'Balanced', sub:'60% shares', s:'alt', st:'BALANCED' }, { k:'adventurous', l:'Adventurous', sub:'90% shares', s:'alt', st:'ADVENTUROUS' } ],
    h:{ name:p.name, amt, suit, horizon } });
};
res.wmClient = (c, k) => {
  const h = c.h, idx = LEVELS.indexOf(k), nm = first(h.name);
  addClient({ name:h.name, amt:h.amt, put:k, suit:h.suit, mis: Math.max(0, idx - h.suit) });
  money('wealth', h.amt * 0.01, 'Advice fee'); chip('Client assets +' + fmt(h.amt), 'good');
  { const g = GROWTH[k], fee = wmFee(), fv = h.amt * Math.pow(1 + (g - fee) / 100, h.horizon), inf = inflation(); custSay(`At an assumed ${g}% a year, ${full(h.amt)} could be ${full(fv)} in ${h.horizon} years after fees, or about ${full(fv / Math.pow(1 + inf / 100, h.horizon))} in today's money if inflation stays at ${inf.toFixed(1)}%. It can also fall in value.`); }
  say(`${nm} signs the suitability report. ${idx < h.suit ? 'They wonder aloud whether it will grow enough.' : 'Portfolio set up.'}`);
  if (idx < h.suit) later(ri(3, 6), { text:`${h.name} moved their portfolio elsewhere, saying it was too timid for a ${h.horizon}-year plan.`, trust:-1, tone:'bad', special:'leave', who:h.name });
  else dT(1);
};

gen.wmHouse = () => card('wmHouse', { label:'Proposal', who:{ name:'Your product team', sub:'Wealth', age:0, hue:0 }, note:'Wants to launch your own multi-asset fund and move clients into it. It earns you more than recommending other firms\' funds.',
  fields:[ F('Fee now', STD_FEE.toFixed(2) + '% a year'), F('Fee in own fund', HOUSE_FEE.toFixed(2) + '% a year'), F('Client assets', full(aum())) ],
  opts:[ { k:'all', l:'Switch every client', s:'go', st:'SWITCHED' }, { k:'new', l:'New clients only', s:'alt', st:'NEW ONLY' }, { k:'no', l:'Keep independent funds', s:'neutral', st:'REJECTED' } ] });
res.wmHouse = (c, k) => {
  if (k === 'all'){ S.wm.clients.forEach(x => x.house = true); S.wm.houseNew = true; dT(-3); say('Clients get a letter explaining the switch. Fees go up from next month.'); later(ri(4, 7), { special:'houseRefund', p:0.5 }); }
  if (k === 'new'){ S.wm.houseNew = true; dT(-1); say('New clients will be put in your own fund.'); later(ri(5, 8), { special:'houseRefund', p:0.25 }); }
  if (k === 'no'){ dT(1); say('You keep recommending the best fund for each client, whoever runs it.'); }
};

gen.wmMarket = () => card('wmMarket', { label:'Market alert', who:{ name:'Your wealth desk', sub:'Clients calling', age:0, hue:0 }, note:`Shares fell ${pc(-S.lastMkt)} last month. Clients are worried and the phones won't stop.`,
  fields:[ F('Client assets', full(aum()), 'Client assets'), F('Markets this year', (S.mkt / S.mktY0 - 1 >= 0 ? '+' : '') + pc(S.mkt / S.mktY0 - 1)) ],
  opts:[ { k:'call', l:'Call every client', sub:`Adviser overtime ${fmt(12)}`, s:'go', st:'CALLED' }, { k:'cash', l:'Move everyone to cash', s:'no', st:'SOLD' }, { k:'email', l:'Send a reassuring email', s:'neutral', st:'SENT' } ], h:{} });
res.wmMarket = (c, k) => {
  if (k === 'call'){ money('costs', -12, 'Overtime'); S.wm.calm = S.month + 3; dT(2); say('Most clients hold their nerve after talking it through.'); }
  if (k === 'cash'){ S.wm.cashUntil = S.month + 4; say('Portfolios sold and held in cash. The falls are now locked in.'); later(4, { special:'cashReview', mktAt:S.mkt }); }
  if (k === 'email'){ dT(-1); say('Email sent. A few clients move their money anyway.'); S.wm.clients.forEach(x => { if (!x.block && chance(0.08)) x.gone = true; }); S.wm.clients = S.wm.clients.filter(x => !x.gone); }
};

gen.wmPep = () => {
  const p = person(45, 70), bad = chance(0.4), amt = Math.round(rf(1800, 3200) / 10) * 10;
  return card('wmPep', { label:'Wealth onboarding', phys:true, who:{ ...p, sub:'Private client' }, note:`Wants you to manage ${full(amt)}. Says it came from selling a property company abroad.`,
    fields:[ F('Investing', full(amt)), F('Family', 'Brother is a government minister abroad', 'PEP', true), F('Documents', sig(bad, ['Sale contract and tax return supplied','Lawyer\'s letter confirming sale'], ['Promised next week','Company registry shows no sale'], 0.8, 0.7), null, true), F('Wants', 'Money invested this week') ],
    opts:[ { k:'edd', l:'Enhanced due diligence', sub:'Takes 3–4 weeks', s:'alt', st:'CHECKING' }, { k:'yes', l:'Accept now', s:'go', st:'ACCEPTED' }, { k:'no', l:'Decline', s:'no', st:'DECLINED' } ], h:{ name:p.name, bad, amt } });
};
res.wmPep = (c, k) => {
  const h = c.h, nm = first(h.name);
  const onboard = () => { addClient({ name:h.name, amt:h.amt, put:'balanced', suit:1 }); money('wealth', h.amt * 0.005, 'Advice fee'); chip('Client assets +' + fmt(h.amt), 'good'); };
  if (k === 'edd'){ money('costs', -3, 'Checks');
    if (h.bad){ say('The records didn\'t match the story. You declined and filed a suspicious activity report.', 'good'); dC(3); S.stats.sars++; }
    else if (chance(0.8)){ onboard(); say(`Checks came back clean. ${nm}'s money arrives a month later.`); }
    else say(`${nm} wouldn't wait and went to another firm.`); }
  if (k === 'yes'){ onboard(); say(`${nm}'s money arrives the same week.`); if (h.bad) later(ri(3, 7), { text:`${h.name}'s wealth turned out to be proceeds of corruption. Regulator finding: weak checks on a politically exposed person.`, cash:-rf(80, 200), key:'redress', comp:-15, tone:'bad', fine:true }); }
  if (k === 'no'){ say(`${nm} takes the money elsewhere.`); if (!h.bad) dT(-1); }
};

gen.wmVuln = () => {
  const cl = pick(S.wm.clients.filter(x => !x.block)), scam = chance(0.75), amt = Math.round(Math.min(cl.amt * 0.6, rf(40, 220)));
  return card('wmVuln', { label:'Wealth client', phys:true, who:{ name:cl.name, age:ri(74, 89), hue:0.5, sub:'Existing client' }, note: scam ? `Wants to withdraw ${full(amt)} for an investment a new friend recommended, paying 14% a year.` : `Wants to withdraw ${full(amt)} to buy a holiday flat in Spain.`,
    fields:[ F('Withdrawal', full(amt)), F('Recent change', scam ? pick(['Recently widowed','Lives alone since a fall']) : pick(['Recently retired','None noted'])), F('Who\'s pushing', scam ? 'A "friend" met online, who rings daily' : 'Spouse is keen; daughter has seen the flat', null, true) ],
    opts:[ { k:'pay', l:'Process it', s:'go', st:'PAID' }, { k:'pause', l:'Pause and talk it through', sub:'Offer to involve family', s:'alt', st:'PAUSED' }, { k:'refuse', l:'Refuse', s:'no', st:'REFUSED' } ], h:{ cid:cl.name, scam, amt } });
};
res.wmVuln = (c, k) => {
  const h = c.h, cl = S.wm.clients.find(x => x.name === h.cid), nm = first(h.cid);
  const out = () => { if (cl) cl.amt = Math.max(0, cl.amt - h.amt); chip('Client assets ' + fmt(-h.amt), 'bad'); };
  if (k === 'pay'){ out(); if (h.scam){ say(`The money vanished within days. ${nm}'s family asks why nobody stopped it.`, 'bad'); dT(-4); dC(-3); } else { say(`${nm} sends a photo of the view.`); dT(1); } }
  if (k === 'pause'){ if (h.scam){ say(`${nm}'s daughter joined the call. The "friend" stopped ringing.`, 'good'); dT(4); } else { say(`${nm} goes ahead a week later, slightly irritated.`); out(); dT(-1); } }
  if (k === 'refuse'){ if (h.scam){ say(`${nm} is furious but the money is safe.`); dT(1); } else { say(`${nm} complains that you treated them as incapable, and moves everything.`, 'bad'); if (cl) S.wm.clients = S.wm.clients.filter(x => x !== cl); dT(-3); } }
};

gen.wmCampaign = () => { const elig = Math.round(S.deposits * 0.12);
  return card('wmCampaign', { label:'Proposal', who:{ name:'Your wealth team', sub:'Sales target', age:0, hue:0 }, note:'Wants advisers to call savers with £50,000 or more in easy-access accounts and pitch them portfolios.',
    fields:[ F('Savings eligible', full(elig)), F('Liquidity now', pc(liqRatio()), 'Liquidity'), F('Fee on portfolios', STD_FEE.toFixed(2) + '% a year'), F('Savings rate you pay', S.savRate.toFixed(2) + '%') ],
    opts:[ { k:'run', l:'Call every saver', s:'go', st:'LAUNCHED' }, { k:'ask', l:'Only savers who ask', s:'alt', st:'ON REQUEST' }, { k:'no', l:'Don\'t', s:'neutral', st:'REJECTED' } ], h:{ elig } }); };
res.wmCampaign = (c, k) => {
  if (k === 'no'){ say('Savers are left alone.'); return; }
  const x = Math.round(c.h.elig * (k === 'run' ? 0.55 : 0.15));
  depMove(-x); addClient({ name: k === 'run' ? 'Savers from the call campaign' : 'Savers who asked', amt:x, put:'balanced', suit:1, mis: k === 'run' ? 0.35 : 0, block:true }); S.wm.won--;
  chip('Client assets +' + fmt(x), 'good'); money('wealth', x * 0.005, 'Advice fees');
  say(k === 'run' ? `${full(x)} moves from savings into portfolios. Some of those savers wanted easy access, not shares.` : `${full(x)} moves from savings into portfolios.`);
  if (k === 'run') dT(-2);
};

function wealthMonth(m, ev){
  const W = S.wm, r = S.lastMkt; if (!W) return;
  let fees = 0, left = 0;
  for (const c of [...W.clients]){
    const w = W.cashUntil >= m ? 0.03 : EQ[c.put];
    c.amt *= 1 + w * r + (1 - w) * S.base / 1200;
    c.peak = Math.max(c.peak || c.amt, c.amt);
    const f = c.amt * (c.house ? HOUSE_FEE : STD_FEE) / 1200; fees += f;
    if (c.house) W.houseExtra += c.amt * (HOUSE_FEE - STD_FEE) / 1200;
    const dd = 1 - c.amt / c.peak;
    if (c.mis > 0 && dd > 0.08 && R() < (c.block ? 0.2 : 0.3)){
      const red = c.amt * dd * Math.min(1, c.mis) * (c.block ? 0.4 : 0.6);
      post('redress', -red); S.stats.fines += red; S.comp = clamp(S.comp - 3, 0, 100); S.trust = clamp(S.trust - 2, 0, 100);
      if (c.block){ c.mis = 0; c.amt *= 0.9; ev(`Complaints from ${c.name.toLowerCase()}: portfolios too risky for people who wanted easy access. Redress ${fmt(red)}.`, 'bad'); }
      else { W.clients = W.clients.filter(x => x !== c); ev(`${c.name} complained: a ${c.put} portfolio didn't suit their plans and it has fallen ${pc(dd, 0)}. The Ombudsman agreed. Redress ${fmt(red)}.`, 'bad'); }
      continue;
    }
    const churn = 0.006 + Math.max(0, 50 - S.trust) / 3000 + (c.house ? 0.004 : 0) - (W.calm >= m ? 0.004 : 0);
    if (c.block) c.amt *= 1 - Math.max(0, churn);
    else if (R() < churn){ W.clients = W.clients.filter(x => x !== c); left++; }
  }
  post('wealth', fees); post('costs', -W.cost);
  if (left) ev(`${left} wealth client${left > 1 ? 's' : ''} moved to another firm.`, 'bad');
}
function wealthSpecial(p, ev){
  if (p.special === 'houseRefund' && S.wm){ const amt = S.wm.houseExtra + 10; post('redress', -amt); S.stats.fines += amt; S.comp = clamp(S.comp - 8, 0, 100); S.wm.clients.forEach(x => x.house = false); S.wm.houseNew = false; S.wm.houseExtra = 0; ev(`Regulator fair-value review: your own fund cost clients more for no extra benefit. Refunds and costs ${fmt(amt)}. Clients moved back to independent funds.`, 'bad'); }
  if (p.special === 'cashReview'){ const d = S.mkt / p.mktAt - 1; if (d > 0.03){ S.trust = clamp(S.trust - 3, 0, 100); S.comp = clamp(S.comp - 2, 0, 100); ev(`Shares are up ${pc(d)} since you moved clients to cash. They missed the rebound, and several have complained.`, 'bad'); } else ev(`Shares are ${d >= 0 ? 'up' : 'down'} ${pc(Math.abs(d))} since you moved clients to cash. Clients are relieved.`, d < 0 ? 'good' : ''); }
  if (p.special === 'leave' && S.wm){ const c = S.wm.clients.find(x => x.name === p.who); if (c){ S.wm.clients = S.wm.clients.filter(x => x !== c); S.trust = clamp(S.trust - 1, 0, 100); ev(`${p.who} moved their portfolio elsewhere: it was too timid for their plans.`, 'bad'); } }
}

gen.capital = () => {
  S.lastCapCard = S.month;
  const morts = S.loans.filter(l => l.kind === 'mortgage' && l.status === 'current'), mb = morts.reduce((a, l) => a + l.bal, 0);
  const opts = [ { k:'raise', l:`Raise ${fmt(300)} from shareholders`, sub:'Their stake is diluted', s:'go', st:'RAISED' } ];
  if (mb > 300) opts.push({ k:'sell', l:'Sell half your new mortgages', sub:`About ${fmt(mb / 2)} at 97p in the £`, s:'alt', st:'SOLD' });
  opts.push({ k:'none', l:'Carry on', s:'no', st:'NOTED' });
  return card('capital', { label:'Capital', who:{ name:'Your finance director', sub:'Capital planning', age:0, hue:0 }, note:`Your capital ratio is ${pc(capRatio())}. Below ${pc(MIN_CAP)} the regulator steps in; below ${pc(FAIL_CAP, 0)} they close you.`,
    fields:[ F('Capital', full(capital())), F('Risk-weighted assets', full(rwa()), 'Capital ratio'), F('Capital ratio', pc(capRatio()), 'Capital ratio'), F('Profit so far this year', fmt(metrics().profit, true)) ], opts, h:{} });
};
function issueEquity(amt){ { const P = pxOf(), price = sharePrice() * 0.9, add = amt / price; P.shares += add; P.issues.push({ y: S.year, m: Math.min(S.month, 11), amt, price: Math.round(price * 1000) / 1000, shares: Math.round(add * 10) / 10 }); }
  news(5, `Counting House asks shareholders for ${fmt(amt)}`, 'The bank says it needs more capital to keep lending.'); je('equity.issue', [['cash', amt], ['equity.paidin', -amt]]); S.injected = (S.injected || 0) + amt; chip('Capital +' + fmt(amt), 'good'); say('Shareholders put in more money. Your profit is now shared across more shares, so each one earns less.'); }
function sellMortgages(){ const ms = S.loans.filter(l => l.kind === 'mortgage' && l.status === 'current').sort((a, b) => b.bal - a.bal); let sold = 0, target = ms.reduce((a, l) => a + l.bal, 0) / 2;
  for (const l of ms){ if (sold >= target) break; sold += l.bal; je('loan.sell', [['cash', l.bal * 0.97], ['pl.gilts', l.bal * 0.03], ['loans', -l.bal]]); S.loans = S.loans.filter(x => x !== l); }
  chip('Mortgages sold ' + fmt(sold), 'neutral'); chip('Loss on sale ' + fmt(-sold * 0.03), 'bad'); say(`Another bank buys ${full(sold)} of mortgages. Less risk on your books, less interest coming in.`); return sold; }
res.capital = (c, k) => {
  if (k === 'raise') issueEquity(300);
  if (k === 'sell') sellMortgages();
  if (k === 'none') say('No action. The regulator will be watching the next set of numbers.');
};

const UPGRADES = [
  { key:'cashier', name:'Second cashier', cost:15, monthly:4, blurb:'Recruit and train another cashier.', effect:'Serve 2 more customers a month' },
  { key:'train', name:'Fraud and scam training', cost:15, monthly:0, blurb:'A course for every member of staff on fraud, scams and money mules.', effect:'Warning signs on applications become more reliable' },
  { key:'analyst', name:'Credit analyst', cost:0, monthly:2, blurb:'An experienced underwriter who reviews every loan application.', effect:'A risk rating on every loan application' },
  { key:'fraudModel', name:'Fraud scoring model', cost:30, monthly:0, blurb:'Machine-learning scores on card payments.', effect:'A score on every card fraud alert', flag:true },
  { key:'ob', name:'Open banking checks', cost:20, monthly:0, blurb:'With consent, see an applicant\'s real spending at their other bank.', effect:'Spending insight on personal loans', flag:true },
  { key:'refurb', name:'Branch refurbishment', cost:35, monthly:0, blurb:'New counters, lighting and a children\'s corner.', effect:'Happier customers for good, and more deposits each month' },
  { key:'app', name:'New mobile app', cost:50, monthly:-4, blurb:'Let customers do the simple things on their phones.', effect:'More deposits each month; running costs £4k lower' },
];
function owned(key){ const u = UPGRADES.find(x => x.key === key); return u && u.flag ? !!S.flags[key] : !!(S.up && S.up[key]); }
function upMonthly(){ return UPGRADES.reduce((a, u) => a + (owned(u.key) ? u.monthly : 0), 0); }
function buyUpgrade(key){
  const u = UPGRADES.find(x => x.key === key); if (!u || owned(key) || S.cash < u.cost) return null;
  begin(); S.up = S.up || {};
  money('costs', -u.cost, u.name);
  if (u.flag) S.flags[key] = true; else S.up[key] = true;
  if (key === 'refurb') dT(6); if (key === 'app') dT(2);
  if (key === 'cashier') news(2, 'Counting House hires more counter staff', 'The bank says queues should get shorter.');
  if (key === 'refurb') news(2, 'High street bank reopens after refit', '');
  const o = OUT; OUT = null; return o;
}

const W = [['onboard',2.6],['mortgage',2.6],['personal',1.6],['business',1.6],['card',1],['fraud',2],['app',1.3],['aml',1.3],['complaint',0.8]];

/* ============ SCENARIOS ============ */
const SCENARIOS = {
  freeze: { name:'The funding freeze', era:'2008-style', year:2008,
    blurb:'Banks have stopped lending to each other and a rival has just failed. Savers are nervous and asking for their money back.',
    path:{ name:'a funding freeze', abs:true, rate:[5,5,5,4.75,4.75,4.5,4.25,3.75,3,2,1.5,1], uArr:[0,0.1,0.2,0.4,0.6,0.8,1,1.3,1.6,1.9,2.2,2.4], hArr:[0,-1,-2,-3,-4,-5,-6,-7,-8,-9,-11,-13], mktArr:[-3,-4,-2,-6,-1,-3,-5,-9,-12,-6,2,1], infArr:[2.5,2.5,2.5,3,3.3,3.8,4.4,4.7,5.2,4.5,4.1,3.1], drain:[0.012,0.02,0.025,0.025,0.02,0.015,0.015,0.01,0.005,0,0,0], liqMult:1.7, u:[0,0], h:[0,0] },
    setup(){ S.base = 5; S.y0 = { base:5, u:5.2, h:1 }; S.trust = 46; S.savRate = 4; S.legacy += 1800; S.cash -= 1800; S.sched.liq = [1, 3, 6, 9]; S.sched.crash = -1; },
    w:{ business:1.3, personal:0.8 },
    goals:[ { id:'liq', label:'Keep liquidity at 15% or more every month', always: h => h.liq >= 0.15 }, { id:'boe', label:'Never run out of cash', end: () => S.stats.emergency === 0 }, { id:'trust', label:'Finish with customer trust of 55 or more', end: () => S.trust >= 55 } ] },
  shock: { name:'The rate shock', era:'2022-style', year:2022,
    blurb:'Rates sat near zero for years and you bought 10-year gilts paying 1%. Now inflation is high and Bank Rate is climbing fast.',
    path:{ name:'a rate shock', abs:true, stress:0.25, rate:[0.5,0.75,0.75,1,1.25,1.25,1.75,2.25,2.25,3,3.5,3.5], uArr:[0,0,0.1,0.1,0.2,0.2,0.3,0.3,0.4,0.5,0.6,0.7], hArr:[0,1,2,3,3,3,2,1,0,-1,-3,-4], mktArr:[-1,-2,-1,-3,0,-4,2,-3,-5,3,2,1], infArr:[5.5,6.2,7,9,9.1,9.4,10.1,9.9,10.1,11.1,10.7,10.5], u:[0,0], h:[0,0] },
    setup(){ S.base = 0.25; S.y0 = { base:0.25, u:3.9, h:1 }; S.savRate = 0.1; S.gilts = [{ kind:'long', amt:3500, coupon:0.9, dur:8.2, y0:0.9 }, { kind:'short', amt:300, coupon:0.4, dur:1.9, y0:0.4 }]; S.cash -= 2000; S.legacy += 1600; S.cash -= 1600; S.sched.liq = [7, 10]; S.sched.crash = -1; },
    w:{ mortgage:1.4 },
    goals:[ { id:'liq', label:'Keep liquidity at 28% or more every month, counting gilts at today\'s prices', always: h => h.liq >= 0.28 }, { id:'fair', label:'Pass at least half of every rate rise on to savers', end: () => !S.stats.stingy }, { id:'gilt', label:'Don\'t sell gilts at a loss', end: () => !S.stats.giltLoss } ] },
  lockdown: { name:'The lockdown', era:'2020-style', year:2020,
    blurb:'Shops shut overnight. Unemployment is jumping, Bank Rate is cut to almost zero and scammers are busy. The government will guarantee new business loans.',
    path:{ name:'a lockdown', abs:true, rate:[0.75,0.25,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1], uArr:[0,1.2,2.6,3.2,3,2.7,2.4,2,1.7,1.4,1.1,0.9], hArr:[0,-1,-2,-2,-1,0,1,2,3,4,5,6], mktArr:[-14,-9,6,4,2,3,1,2,1,2,3,2], infArr:[1.8,1.5,0.8,0.5,0.6,1,0.2,0.5,0.7,0.3,0.6,0.6], u:[0,0], h:[0,0] },
    setup(){ S.base = 0.75; S.y0 = { base:0.75, u:4, h:1 }; S.savRate = 0.5; S.prodOrder = ['ggs'].concat(S.prodOrder.filter(k => k !== 'ggs')); S.sched.prod = [0, 2, 4, 6, 8, 10]; S.sched.crash = -1; },
    w:{ fraud:1.6, app:2, business:1.6, mortgage:0.6, card:1.4 },
    goals:[ { id:'vuln', label:'Never repossess or sell the debt of a vulnerable customer', end: () => !S.stats.harsh }, { id:'loss', label:'Keep credit losses on new loans under £80k', end: () => S.stats.losses < 80 }, { id:'trust', label:'Finish with customer trust of 70 or more', end: () => S.trust >= 70 } ] },
};
function goalDefs(){ return S.scenario ? SCENARIOS[S.scenario].goals : []; }
function evalGoals(h, final){
  if (!S.goals) return;
  for (const g of S.goals){ const d = goalDefs().find(x => x.id === g.id); if (!d || g.ok === false) continue;
    if (d.always && h && !d.always(h)) g.ok = false;
    if (final){ if (S.over && S.over !== 'done') g.ok = false; else if (d.end) g.ok = !!d.end(); else if (g.ok !== false) g.ok = true; } }
}

/* ============ GAME FLOW ============ */
function newGame(seed, opts = {}){
  seed = (seed == null ? (Date.now() & 0x7fffffff) : seed) | 0;
  S = { v:2, rs:seed, seed, month:0, year:2027, path:'soft', cash:5000, gilts:[{ kind:'short', amt:1800, coupon:4.1, dur:1.9, y0:4.15 }], deposits:15650, wholesale:0, wsTranches:[], collateral:0, swaps:[], bonds:0, bondTranches:[], retained:0, pools:[], large:[],
    legacy:10000, legacyRate:6.0, loans:[], savRate:2.5, cb:0, base:4.0, startCap:0,
    trust:60, comp:80, flags:{}, queue:[], qi:0, pending:[], pl:blankPL(), last:null, history:[], over:null, nextId:1,
    lastTreasury:-9, prodOrder:[], prodUsed:[], sched:{}, y0:{ base:4, u:4.3, h:1 }, career:[], divPaid:0, wm:null, wmOffer:2, mkt:100, mktY0:100, mktHist:[100], lastMkt:0,
    stats: freshStats(), up:{}, news:[], tutorial: !!opts.tutorial, scenario: opts.scenario || null,
    engine:ENGINE_VERSION, progress:{ unlocked:['branch'] }, policy:systemPolicy(), ledger:{ bal:{}, n:0 } };
  S.path = pick(['soft', 'sticky', 'downturn']);
  if (opts.households && !opts.tutorial && !opts.scenario) S.households = makeCast();
  if (opts.chiefExecutive && !opts.tutorial && !opts.scenario) S.progress.unlocked = ['branch'].concat(CE_AREAS);      // start straight in the Chief Executive role
  S.prodOrder = shuffle(['fraudModel','ob','od','branch','cyber','campaign']).concat(shuffle(['broker','ggs']));
  if (S.scenario){ const sc = SCENARIOS[S.scenario]; S.path = 'sc'; S.year = sc.year; S.tutorial = false; S.sched = makeSched(); sc.setup(); S.goals = sc.goals.map(g => ({ id:g.id, label:g.label, ok:null })); }
  else S.sched = makeSched();
  openLedger('opening');
  S.startCap = capital();
  S.stats.minCap = capRatio();
  buildMonth();
  welcomeMail();
  return S;
}
function freshStats(){ return { customers:0, wrongNo:0, loans:0, lent:0, defaults:0, losses:0, fraudStop:0, fraudMiss:0, scamStop:0, scamMiss:0, sars:0, fines:0, boe:0, emergency:0, minCap:1, capBreach:0 }; }
function makeSched(){ return { crash: chance(S.path === 'sticky' || S.path === 'downturn' ? 0.5 : 0.2) ? ri(2, 9) : -1, pep: ri(3, 10), prod:[1,3,5,7,9], liq: S.path === 'downturn' ? [ri(3, 5), ri(7, 10)] : [ri(3, 9)], out: S.flags.cyber && chance(0.5) ? -1 : ri(2, 10), sanc:[ri(1, 5), ri(6, 11)] }; }
function nextYear(){
  if (S.scenario) return;
  const r = rating();
  S.career.push({ year:S.year, letter:r.letter, profit:r.profit, trust:Math.round(S.trust), comp:Math.round(S.comp) });
  S.y0 = S.sim ? S.stressY0 : { base:S.base, u:unemp(11), h:hpi(11), inf:inflation(11) };      // a stress test keeps counting from where it began
  for (const l of S.loans){ l.m0 -= 12; if (l.since != null) l.since -= 12; if (!l.hpi0) l.hpi0 = 1; }
  for (const p of S.pending) p.due -= 12;
  S.lastTreasury -= 12;
  if (typeof S.flags.od === 'number') S.flags.od -= 12;
  householdYear();
  S.year++; S.month = 0; S.over = null; S.history = []; S.divPaid = 0; S.injected = 0; S.rateSum = 0; if (S.lastCapCard != null) S.lastCapCard -= 12; S.mktY0 = S.mkt;
  S.wmOffer = S.wm ? -1 : 1; S.news = [];
  if (S.wm){ for (const k of ['houseAt','campAt','calm','cashUntil']) S.wm[k] -= 12; }
  const b = S.y0.base, u = S.y0.u;
  if (S.sim) S.path = S.simPath; else S.path = wpick([['soft', b > 4.5 ? 3 : 2], ['sticky', b < 3 ? 3 : b > 5 ? 0.3 : 1.8], ['downturn', u > 6.5 ? 0.3 : b > 5 ? 2.5 : 1.4], ['recovery', u > 5 ? 4 : 0.4]]);
  if (!S.prodOrder.includes('broker')) S.prodOrder = S.prodOrder.concat(shuffle(['broker','ggs']));
  S.startCap = capital();
  S.stats = freshStats(); S.stats.minCap = capRatio();
  S.sched = S.sim ? simSched() : makeSched();
  applyQuiet();
  grantUnlock(r);
  buildMonth();
}
function migrate(s){ if (s.policy && !s.policy.operations){ s.policy.operations = systemPolicy().operations; s.policy.owner.operations = 'system'; } if (s.policy && s.policy.funding && s.policy.funding.boeTarget == null) s.policy.funding.boeTarget = 0; for (const t of s.wsTranches || []) if (t.id == null){ t.id = (s.fid = (s.fid || 0) + 1); t.start = t.due - 3; } for (const t of s.bondTranches || []) if (t.id == null){ t.id = (s.fid = (s.fid || 0) + 1); t.start = t.due - 12; } if (s.swaps == null){ s.swaps = []; s.collateral = 0; } if (s.policy && s.policy.treasury && s.policy.treasury.hedgeTarget == null){ s.policy.treasury.hedgeTarget = 0; s.policy.treasury.hedgeYears = 3; } if (s.wholesale == null){ s.wholesale = 0; s.wsTranches = []; } if (s.bonds == null){ s.bonds = 0; s.bondTranches = []; s.retained = 0; s.pools = []; s.large = []; } if (!s.policy) s.policy = systemPolicy(); { const sp = systemPolicy(); for (const a of ['treasury', 'funding', 'capital']) if (!s.policy[a]) s.policy[a] = sp[a]; if (s.policy.capital.dividendPayout == null) s.policy.capital.dividendPayout = 0; for (const [k, v] of Object.entries(sp.funding)) if (s.policy.funding[k] == null) s.policy.funding[k] = v; for (const a of Object.keys(sp.owner)) if (!s.policy.owner[a]) s.policy.owner[a] = 'system'; } if (!s.up) s.up = {}; if (!s.news) s.news = []; if (!s.stats.harsh) s.stats.harsh = 0; if (s.queue && s.qi){ s.queue.forEach((c, i) => { if (i < s.qi && !c.done) c.done = 'x'; }); } if (!s.inbox) s.inbox = []; if (s.mkt == null){ s.wm = null; s.wmOffer = s.month <= 2 ? 2 : -1; s.mkt = 100; s.mktY0 = 100; s.mktHist = [100]; s.lastMkt = 0; } if (s.pl && s.pl.wealth == null) s.pl.wealth = 0; if (s.sched && s.sched.crash == null){ s.sched.crash = -1; s.sched.pep = 6; } if (!s.y0) s.y0 = { base:4, u:4.3, h:1 }; if (!s.career) s.career = []; if (s.divPaid == null) s.divPaid = 0; if (!s.progress) s.progress = { unlocked:['branch'] }; if (!s.engine) s.engine = ENGINE_VERSION; const keep = S; S = s; try { if (!s.ledger) openLedger('opening (migrated)'); welcomeMail(); } finally { S = keep; } return s; }
/* ---- recurring households ----
   Seven named households (a student, a young renter, a couple buying their first home, a family, a self-employed
   tradesperson, a retiree and a single parent) stay with the bank for the whole game. Their money moves each month
   with the economy and with life events, and with what the player decides about them: a mortgage payment, a missed
   payment, an overdraft fee. Some of the month's loan applications come from them, so the player meets the same
   people again. Only games started with the households option have them. */
const HH_TEMPLATES = [
  { stage: 'student', label: 'Student', age: [19, 22], income: 950, ess: 820, cash: 0.4, other: 4.5, score: 620, goal: 'Stay out of the overdraft' },
  { stage: 'renter', label: 'Young renter', age: [24, 29], income: 2250, ess: 1650, cash: 1.2, other: 1.5, score: 680, goal: 'Save a house deposit' },
  { stage: 'couple', label: 'Couple buying their first home', age: [29, 35], income: 5100, ess: 3300, cash: 3, other: 2, score: 740, goal: 'Buy a first home' },
  { stage: 'family', label: 'Family with children', age: [36, 44], income: 4500, ess: 3750, cash: 1, other: 6, score: 700, goal: 'Build an emergency fund' },
  { stage: 'selfemp', label: 'Self-employed tradesperson', age: [34, 48], income: 3100, ess: 2200, cash: 2, other: 3, score: 690, goal: 'Cope with lean months' },
  { stage: 'retiree', label: 'Retiree', age: [67, 73], income: 1700, ess: 1450, cash: 9, other: 0, score: 790, goal: 'Make savings last' },
  { stage: 'parent', label: 'Single parent', age: [31, 40], income: 2350, ess: 2050, cash: 0.7, other: 2.5, score: 600, goal: 'Clear card debt' }];
function makeCast(){
  return HH_TEMPLATES.map((tp, i) => { const p = person(tp.age[0], tp.age[1]);
    return { id: i + 1, name: p.name, age: p.age, hue: p.hue, stage: tp.stage, label: tp.label, goal: tp.goal, income: tp.income, base: tp.income, ess: tp.ess,
      cash: Math.round(tp.cash * tp.ess), other: Math.round(tp.other * 1000), score: tp.score + ri(-25, 25), loanId: null, out: 0, notes: [], hist: [] }; });
}
function hhSay(h, text){ h.notes.push({ y: S.year, m: S.month, t: text }); if (h.notes.length > 12) h.notes.shift(); }
function householdMonth(){
  if (!S.households) return;
  const m = S.month;
  for (const h of S.households){
    let inc = h.income;
    if (h.out > 0){ h.out--; inc = h.income * 0.4; if (!h.out) hhSay(h, 'Back in work.'); }
    else if (h.stage !== 'retiree' && R() < (unemp() / 100) * (h.stage === 'selfemp' ? 0.12 : h.stage === 'student' ? 0.02 : 0.05)){ h.out = ri(2, 5); inc = h.income * 0.4; hhSay(h, 'Lost their job, so income is down for a few months.'); }
    else if (h.stage !== 'retiree' && R() < 0.008){ h.income = Math.round(h.income * 1.08); hhSay(h, 'Started a new job with a pay rise.'); }
    if (['renter', 'couple', 'parent'].includes(h.stage) && h.age < 42 && R() < 0.005){ h.ess += 350; hhSay(h, 'Had a baby, so costs are up.'); }
    inc *= 1 + gauss(0, h.stage === 'selfemp' ? 0.12 : 0.02);
    let pay = 0, missed = false;
    const l = h.loanId ? S.loans.find(x => x.id === h.loanId) : null;
    if (h.loanId && !l){ hhSay(h, 'Their loan with us has ended.'); h.loanId = null; }
    if (l){ pay = (l.bal * l.rate / 1200 + l.bal * AMORT[l.kind]) * 1000; if (l.status === 'arrears') missed = true; }
    const op = h.other * 0.015, disc = inc * 0.1;
    h.other = Math.max(0, h.other - op * 0.6);
    const fee = (h.cash < 0 && S.flags.od !== undefined && S.flags.od !== false && S.flags.od < m) ? 90 : 0;
    const spend = h.ess + disc + (missed ? 0 : pay) + op + fee, net = inc - spend;
    h.cash += net;
    if (missed){ h.score -= 40; if (!h.missed) hhSay(h, 'Fell behind on their loan repayments.'); h.missed = true; }
    else { h.missed = false; h.score += h.cash >= 0 ? 1.5 : -3; }
    if (fee){ h.score -= 2; if (!h.fee) hhSay(h, 'Was charged overdraft fees.'); h.fee = true; } else h.fee = false;
    h.score = clamp(Math.round(h.score * 10) / 10, 300, 999);
    h.hist.push({ y: S.year, m, income: Math.round(inc), spend: Math.round(spend), saved: Math.round(net), debt: Math.round((l ? l.bal * 1000 : 0) + h.other), score: Math.round(h.score), fund: Math.round(h.cash / h.ess * 10) / 10 });
    if (h.hist.length > 36) h.hist.shift();
  }
}
function householdYear(){
  if (!S.households) return;
  for (const h of S.households){ h.age++; if (h.age >= 67 && h.stage !== 'retiree'){ h.stage = 'retiree'; h.label = 'Retired'; h.income = Math.round(h.income * 0.55); h.base = h.income; h.ess = Math.round(h.ess * 0.8); hhSay(h, 'Retired on a smaller income.'); } }
}
// some applications come from the same households again
function hhLinkCards(){
  if (!S.households) return;
  const used = new Set();
  for (const c of S.queue){
    if (c.done || !['mortgage', 'personal', 'card'].includes(c.kind) || !c.h || c.h.hh != null) continue;
    if (!(R() < 0.35)) continue;
    const pool = S.households.filter(h => !used.has(h.id) && !h.loanId && (c.kind !== 'mortgage' || ['couple', 'family', 'renter', 'selfemp', 'parent'].includes(h.stage)));
    if (!pool.length) continue;
    const hh = pick(pool); used.add(hh.id);
    c.who = Object.assign({}, c.who, { name: hh.name, age: hh.age, hue: hh.hue }); c.h.name = hh.name; c.h.hh = hh.id;
    if (c.h.inc){ hh.income = hh.base = Math.round(takeHome(c.h.inc) * 1000); hh.ess = Math.round(hh.income * 0.62); }
    const last = hh.notes[hh.notes.length - 1];
    c.note = `${first(hh.name)} is a regular customer (${hh.label.toLowerCase()}).${last ? ' Last time: ' + last.t.charAt(0).toLowerCase() + last.t.slice(1) : ''} ` + c.note;
  }
}
function hhBooked(l){
  const h = S.households && S.households.find(x => x.id === l.hh);
  if (!h) return;
  h.loanId = l.id; hhSay(h, `Took a ${KNAME[l.kind]} of ${full(l.bal)} from us.`);
}
function hhOutcome(c, k){
  const h = S.households && S.households.find(x => x.id === c.h.hh);
  if (!h || (h.loanId && S.loans.some(l => l.id === h.loanId && l.hh === h.id))) return;
  hhSay(h, k === 'no' ? `Was turned down for a ${KNAME[c.kind] || 'loan'}.` : `Did not go ahead with the ${KNAME[c.kind] || 'loan'}.`);
}
function buildMonth(){ buildMonthCards(); hhLinkCards(); if (fairValued()) syncGilts(); fundingByPolicy(); boeFacility(); opsByPolicy(); deskByPolicy(); treasuryByPolicy(); capitalByPolicy(); warnMonth(); }
function buildMonthCards(){
  const m = S.month, lead = [], other = [];
  S.pl = blankPL();
  const nr = rateAt(m);
  if (nr !== S.base){ const old = S.base; S.base = nr; if (S.policy.owner.funding === 'player') addMail('Bank of England', `Bank Rate: ${nr.toFixed(2)}%`, `Bank Rate moved from ${old.toFixed(2)}% to ${nr.toFixed(2)}%. Your savings rate follows your funding policy.`, '', S.month, S.year); else lead.push(gen.rate(old, nr)); }
  for (const l of S.loans.filter(l => l.status === 'arrears' && !l.carded).slice(0, 2)) { l.carded = true; lead.push(gen.hardship(l)); }
  if (S.sched.prod.includes(m)) { const c = gen.product(); if (c) other.push(c); }
  if (S.sched.liq.includes(m)) other.push(gen.liqshock());
  if (!S.wm && S.wmOffer === m) other.push(gen.wmLaunch());
  if (S.wm){ if (S.lastMkt < -0.05) lead.push(gen.wmMarket()); if (S.wm.houseAt === m) other.push(gen.wmHouse()); if (S.wm.campAt === m) other.push(gen.wmCampaign()); if (S.sched.pep === m) other.push(gen.wmPep()); }
  if (S.sched.out === m) other.push(gen.outage());
  if (S.sched.sanc.includes(m)) other.push(gen.sanctions());
  if (capRatio() < 0.125 && m - (S.lastCapCard ?? -9) >= 2 && S.policy.owner.capital !== 'player') lead.push(gen.capital());
  if (liqRatio() < 0.16) other.push(gen.funding());
  else if (S.cash - 0.2 * S.deposits > 1000 && m - S.lastTreasury >= 3 && S.policy.owner.treasury !== 'player') other.push(gen.treasury());
  if (m === 0 && S.tutorial && S.year === 2027 && !S.career.length){
    const T = [
      [gen.onboard({ bad:false, saver:false }), 'Compare the ID, address and device checks, and whether the money expected fits the job. When everything lines up, this is an ordinary customer.'],
      [gen.onboard({ bad:true }), 'Several checks don\'t line up, and far more money is expected each month than the job would pay. That is the pattern of a money mule: an account used to move stolen money.'],
      [gen.mortgage({ good:true }), 'Check three things: the deposit (LTV), the loan against income (LTI) and the repayment against take-home pay. The underwriter\'s note shows what the loan earns against what a default would cost.'],
      [gen.personal({ risky:true }), 'Big existing debts, a low credit score and gambling or payday loans in their spending mean a high chance of default. A higher rate earns more, but it doesn\'t make a risky borrower safer.'],
      [gen.fraud({ fraud:true }), 'An unusual merchant, a card number typed in by hand and several declines in a row are classic signs of a stolen card.'],
      [gen.aml({ structuring:true }), 'Cash deposits kept just under £10,000 are designed to avoid attention. That is called structuring. Report it and keep the account open; warning the customer would be tipping off.'],
    ];
    S.queue = T.map(([c, t]) => { c.coach = t; return c; }).concat(lead.concat(other).filter(c => c.kind === 'treasury')); S.qi = 0; return;
  }
  if (m === 0) { S.queue = ['onboard','mortgage','fraud','personal','aml','business'].map(k => gen[k]()).concat(lead, other); S.qi = 0; return; }
  const scw = S.scenario ? SCENARIOS[S.scenario].w || {} : {};
  const w = W.map(([k, v]) => [k, v * (k === 'mortgage' && S.flags.broker ? 2 : 1) * (scw[k] || 1)]);
  if (S.wm){ w.push(['wmClient', 2.2]); if (S.wm.clients.filter(x => !x.block).length >= 3) w.push(['wmVuln', 0.4]); }
  const PHYS = { onboard:1, mortgage:1, personal:1, business:1, app:1, wmClient:1 };
  while (lead.length + other.length < 6) other.push(gen[wpick(w)]());
  if (owned('cashier')) for (let i = 0; i < 2; i++) other.push(gen[wpick(w.filter(([k]) => PHYS[k]))]());
  S.queue = lead.concat(shuffle(other)); S.qi = 0;
}
/* ---- the desk by policy ----
   Once the player has taken over credit policy (owner 'player'), the bank no longer waits for them to decide each
   mortgage and personal loan. Each application is decided by the policy: approved and declined ones are processed
   at once, and only the 'refer' cases reach the counter. The bank also receives more applications than a branch
   would, so the policy decides a few each month. A policy that is too loose lends to people who default; too
   tight turns away good customers and the board notices. */
const DESK_VOLUME = { mortgage: 3, personal: 5 }, DESK_REFER_CAP = 3;
function deskByPolicy(){
  if (S.policy.owner.credit !== 'player' || S.tutorial || S.scenario || S.over) return;
  const tally = { approved: 0, declined: 0, referred: 0, lapsed: 0, lent: 0 };
  const decide = c => {
    const v = policyVerdict(c);
    if (v === 'refer') return false;
    const before = loanSum(); resolveCard(c, v === 'approve' ? (c.kind === 'mortgage' ? 'yes' : 'low') : 'no');
    if (v === 'approve'){ tally.approved++; tally.lent += loanSum() - before; } else tally.declined++;
    return true;
  };
  for (const c of S.queue) if ((c.kind === 'mortgage' || c.kind === 'personal') && !c.done) decide(c);
  const extra = [];
  for (let i = 0; i < DESK_VOLUME.mortgage; i++) extra.push(gen.mortgage());
  for (let i = 0; i < DESK_VOLUME.personal; i++) extra.push(gen.personal());
  let queued = 0;
  for (const c of extra) if (!decide(c)){ if (queued < DESK_REFER_CAP){ S.queue.push(c); queued++; } else tally.lapsed++; }
  tally.referred = S.queue.filter(c => (c.kind === 'mortgage' || c.kind === 'personal') && !c.done).length;
  S.qi = S.queue.filter(x => x.done).length;
  S.lastDesk = tally;
  if (tally.approved + tally.declined > 0)
    addMail('Credit team', 'Lending decided by your policy', `${tally.approved} applications approved (${fmt(tally.lent)} lent), ${tally.declined} declined${tally.referred ? `, and ${tally.referred} referred to you at the counter` : ''}${tally.lapsed ? `. ${tally.lapsed} more referrals lapsed because the desk was full` : ''}. These follow the credit policy you set.`, '', S.month, S.year);
}
/* ---- treasury and capital by policy ----
   Once the player owns treasury, the treasurer follows standing rules instead of asking each time: cash above the
   target share of deposits goes into gilts (long or short as the policy says), and a shortfall is covered by
   selling gilts at their market value, which realises any loss. Once the player owns capital, falling below the
   target ratio triggers the chosen action (0 raise shares, 1 sell half the new mortgages, 2 carry on). */
function buyGilts(kind, amt){
  const y = giltYield(kind);
  je('gilts.buy', [['gilts', amt], ['cash', -amt]]); S.gilts.push({ kind, amt, coupon: y, dur: kind === 'long' ? 8.2 : 1.9, y0: y });
}
function sellGiltShare(f){
  const mv = giltMV() * f, bk = giltCarry() * f;
  je('gilts.sell', [['cash', mv], ['gilts', -bk], ['pl.gilts', bk - mv]]);
  for (const g of S.gilts) g.amt *= 1 - f;
  S.gilts = S.gilts.filter(g => g.amt > 1e-9);
  if (mv - bk < -0.5) S.stats.giltLoss = (S.stats.giltLoss || 0) + 1;
  return mv - bk;
}
/* ---- funding by policy ----
   Once the player owns funding: the savings rate is held at the market rate plus the chosen gap, and the bank tops up
   wholesale borrowing to the chosen share of deposits. Wholesale loans last three months and cost Bank Rate plus a
   spread that widens with market stress. In a freeze (the month a liquidity shock hits and the two after, or a market
   crash and the month after) nothing is renewed or topped up, so loans that fall due are simply repaid. */
const WHOLESALE_MONTHS = 3;
function marketFrozen(){ const m = S.month, s = S.sched; return (s.liq || []).some(q => m >= q && m < q + 3) || (s.crash >= 0 && m >= s.crash && m < s.crash + 2); }
function marketStress(){ return Math.min(1, (S.path === 'downturn' || S.path === 'sticky' ? 0.25 : /^stress/.test(S.path) ? 0.4 : 0) + (marketFrozen() ? 0.5 : 0) + (S.trust < 40 ? 0.15 : 0) + (capRatio() < 0.125 ? 0.2 : 0)); }
const wholesaleRate = () => S.base + 0.5 + 2.5 * marketStress();
const FOUNDERS = ['Eastfield Housing Association', 'Marlow District Council', 'Harwood Logistics', 'The Aldric Trust', 'Penrose Developments', 'Calder Valley Co-operative'];
const largeSum = () => (S.large || []).reduce((x, d) => x + d.amt, 0);
function poolMonth(u){
  for (const p of S.pools){
    const pm = (1 - Math.pow(1 - p.pd, 1 / 12)) * AMP * u * (1 + Math.max(0, S.base - S.y0.base) * (P().stress || 0));
    const loss = Math.max(0, p.bal * pm * 0.25 * (1 + gauss(0, 0.25))), take = Math.min(loss, p.ret);
    if (take > 0) je('pool.loss', [['pl.losses', take], ['retained', -take]]);
    p.ret -= take; p.lost = (p.lost || 0) + take; p.over = (p.over || 0) + (loss - take);
    const am = AMORT.mortgage, back = p.ret * am;
    if (back > 0) je('pool.repay', [['cash', back], ['retained', -back]]);
    p.ret -= back; p.bal *= 1 - am;
    if (p.ret > 0) post('intLoans', p.ret * p.rate / 1200);
  }
  S.pools = S.pools.filter(p => p.bal > 1 || p.ret > 1);
}
/* Sells a pool of current mortgages to investors. The bank keeps 5% of each loan as a first-loss slice (the 'retained'
   asset): it takes the first losses on the pool up to that slice, investors take the rest. The price is a discount that
   widens with market stress and with the pool's riskiness. mode: 0 best loans first, 1 worst first, 2 largest first. */
function sellPool(share, mode){
  const el = S.loans.filter(l => l.kind === 'mortgage' && l.status === 'current');
  if (!el.length) return null;
  el.sort(mode === 0 ? (x, y) => x.pd - y.pd : mode === 1 ? (x, y) => y.pd - x.pd : (x, y) => y.bal - x.bal);
  const goal = share * el.reduce((x, l) => x + l.bal, 0), picked = []; let sold = 0, pdW = 0, rateW = 0;
  for (const l of el){ if (sold >= goal) break; picked.push(l); sold += l.bal; pdW += l.bal * l.pd; rateW += l.bal * l.rate; }
  if (sold < 50) return null;
  const pd = pdW / sold, discount = clamp(0.01 + 0.03 * marketStress() + 0.4 * pd, 0, 0.25);
  const cash = 0.95 * sold * (1 - discount), kept = 0.05 * sold, loss = sold - cash - kept;
  je('pool.sale', [['cash', cash], ['retained', kept], ['pl.gilts', loss], ['loans', -sold]]);
  S.loans = S.loans.filter(l => !picked.includes(l));
  S.pools.push({ id: S.nextId++, bal: 0.95 * sold, ret: kept, rate: rateW / sold, pd, orig: sold, lost: 0, over: 0 });
  S.lastPool = S.year * 12 + S.month; S.stats.poolSales = (S.stats.poolSales || 0) + 1;
  return { sold, cash, kept, loss, discount, pd };
}
function fundingByPolicy(){
  if (S.over || S.tutorial || S.scenario) return;
  const own = S.policy.owner.funding === 'player';
  if (!own && !S.wsTranches.length && !S.bondTranches.length && !S.large.length) return;     // handed back: existing wholesale loans, bonds and large depositors remain
  const fp = S.policy.funding, now = S.year * 12 + S.month, notes = [];
  if (own) S.savRate = Math.round(Math.max(0.1, mkt() + fp.savingsSpread) * 100) / 100;

  // wholesale: three-month loans that must be renewed, and cannot be in a freeze
  const wDue = S.wsTranches.filter(w => w.due <= now), wKeep = S.wsTranches.filter(w => w.due > now), repay = wDue.reduce((x, w) => x + w.amt, 0);
  if (repay > 0) je('wholesale.repay', [['wholesale', repay], ['cash', -repay]]);
  const frozen = marketFrozen(), wHeld = wKeep.reduce((x, w) => x + w.amt, 0), wWant = own ? fp.wholesaleTarget * S.deposits - wHeld : 0;
  let borrowed = 0;
  if (!frozen && wWant > 50){ borrowed = Math.floor(wWant / 50) * 50; je('wholesale.borrow', [['cash', borrowed], ['wholesale', -borrowed]]); wKeep.push({ id: fid(), amt: borrowed, rate: wholesaleRate(), start: now, due: now + WHOLESALE_MONTHS }); }
  S.wsTranches = wKeep;

  // fixed-term bonds: locked in at a fixed rate for 1 to 3 years, repaid or refinanced at maturity
  const bDue = S.bondTranches.filter(x => x.due <= now), bKeep = S.bondTranches.filter(x => x.due > now), bRepay = bDue.reduce((x, y) => x + y.amt, 0);
  if (bRepay > 0) je('bond.repay', [['bonds', bRepay], ['cash', -bRepay]]);
  const bHeld = bKeep.reduce((x, y) => x + y.amt, 0), bWant = own ? fp.bondTarget * S.deposits - bHeld : 0;
  let issued = 0;
  if (bWant > 50){ issued = Math.floor(bWant / 50) * 50; const term = Math.round(fp.bondTermYears), rate = Math.round((mkt() + 1 + fp.bondPremium + 0.2 * (term - 1)) * 100) / 100; je('bond.issue', [['cash', issued], ['bonds', -issued]]); bKeep.push({ id: fid(), amt: issued, rate, start: now, due: now + 12 * term }); }
  S.bondTranches = bKeep;

  // large depositors: offers arrive, the cap decides whether to take them, and they can all leave at once
  for (const d of [...S.large]){
    const p = 0.015 + (S.trust < 45 ? 0.05 : 0) + (frozen ? 0.25 : 0) + (capRatio() < MIN_CAP ? 0.15 : 0);
    if (R() < p){ je('deposit.flow', [['cash', -d.amt], ['deposits', d.amt]]); S.large = S.large.filter(x => x !== d); notes.push([`${d.name} has withdrawn ${full(d.amt)} in one go.`, 'bad']); }
  }
  if (own && fp.largeCap > 0 && R() < 0.4){
    const amt = Math.max(100, Math.round(S.deposits * rf(0.03, 0.07) / 50) * 50), name = pick(FOUNDERS);
    if (largeSum() + amt <= fp.largeCap * S.deposits){ je('deposit.flow', [['cash', amt], ['deposits', -amt]]); S.large.push({ id: S.nextId++, name, amt, rate: Math.max(0.1, Math.round((S.base - 0.4) * 100) / 100) }); notes.push([`${name} has placed ${full(amt)} with us at ${Math.max(0.1, S.base - 0.4).toFixed(2)}%.`, '']); }
  }

  // selling a pool of mortgages when liquidity is short
  if (own && fp.poolWhenShort >= 0.5 && liqRatio() < 0.16 && now - (S.lastPool ?? -99) >= 3){
    const r = sellPool(fp.poolShare, Math.round(fp.poolMode));
    if (r) notes.push([`Liquidity was short, so we sold a ${full(r.sold)} pool of mortgages for ${full(r.cash)} and kept ${full(r.kept)} of the risk.`, '']);
  }

  if (frozen && (repay > 0 || wWant > 50)) notes.push([`Wholesale markets are frozen: other banks will not lend. ${repay > 0 ? `${full(repay)} fell due and was repaid, with nothing to replace it. ` : ''}`, 'bad']);
  const wall = S.bondTranches.filter(x => x.due <= now + 6).reduce((x, y) => x + y.amt, 0), soon = S.wsTranches.filter(w => w.due <= now + 3).reduce((x, w) => x + w.amt, 0);
  const funding = S.deposits + S.wholesale + S.bonds, wShare = S.wholesale / funding, lShare = largeSum() / S.deposits;
  if (S.wholesale > 0 || S.bonds > 0 || S.large.length || S.pools.length){
    const bits = [];
    if (S.wholesale > 0) bits.push(`Wholesale ${full(S.wholesale)} (${pc(wShare, 0)} of funding, about ${wholesaleRate().toFixed(2)}% now, ${full(soon)} due within three months).`);
    if (S.bonds > 0) bits.push(`Bonds ${full(S.bonds)}; ${full(wall)} matures within six months.${issued ? ` Issued ${full(issued)} this month.` : ''}`);
    if (S.large.length) bits.push(`Largest depositors hold ${pc(lShare, 0)} of deposits.`);
    if (S.pools.length) bits.push(`Retained exposure on sold mortgages: ${full(S.retained)}. Losses on the pools so far have used ${full(S.pools.reduce((x, p) => x + p.lost, 0))} of it${S.pools.some(p => p.over > 0) ? `, and investors have borne ${full(S.pools.reduce((x, p) => x + p.over, 0))} beyond that` : ''}.`);
    const bad = frozen || wShare > 0.2 || lShare > 0.25 || wall > 0.25 * S.deposits || notes.some(n => n[1] === 'bad');
    addMail('Your treasurer', frozen ? 'Wholesale markets are frozen' : 'Funding position', notes.map(n => n[0]).concat(bits).join(' '), bad ? 'bad' : '', S.month, S.year);
  } else if (notes.length) addMail('Your treasurer', 'Funding position', notes.map(n => n[0]).join(' '), '', S.month, S.year);
}
function treasuryByPolicy(){
  if (S.policy.owner.treasury !== 'player' || S.over || S.tutorial || S.scenario) return;
  const tp = S.policy.treasury, target = tp.liquidityTarget * S.deposits, surplus = S.cash - target;
  S.lastTreasury = S.month;
  hedgeByPolicy();
  if (surplus > 500){
    const amt = Math.floor(surplus * 0.6 / 250) * 250, long = Math.round(amt * tp.longShare / 250) * 250;
    if (long > 0) buyGilts('long', long);
    if (amt - long > 0) buyGilts('short', amt - long);
    if (amt > 0) addMail('Your treasurer', 'Surplus cash invested', `${full(amt)} above the ${pc(tp.liquidityTarget, 0)} cash target went into gilts (${full(long)} long, ${full(amt - long)} short), as your treasury policy says.`, '', S.month, S.year);
  } else if (S.cash < target - 0.04 * S.deposits && giltBook() > 0){
    const f = clamp((target - S.cash) / Math.max(1, giltMV()), 0, 1), res = sellGiltShare(f);
    addMail('Your treasurer', 'Gilts sold to restore cash', `Cash was below your ${pc(tp.liquidityTarget, 0)} target, so ${pc(f, 0)} of the gilts were sold${res < -0.5 ? `, at a loss of ${full(-res)}` : ''}.`, res < -0.5 ? 'bad' : '', S.month, S.year);
  }
}
function capitalByPolicy(){
  if (S.policy.owner.capital !== 'player' || S.over || S.tutorial || S.scenario) return;
  const cp = S.policy.capital;
  if (capRatio() >= cp.capitalTarget || S.month - (S.lastCapCard ?? -9) < 2) return;
  S.lastCapCard = S.month;
  const act = Math.round(cp.capitalAction), before = capRatio();
  begin();
  let what;
  if (act === 0){ issueEquity(cp.raiseAmount); what = `raised ${full(cp.raiseAmount)} from shareholders`; }
  else if (act === 3 && S.year * 12 + S.month - (S.lastPool ?? -99) < 4) what = 'waited, because a pool was sold less than four months ago';
  else if (act === 3){ const fp = S.policy.funding, r = sellPool(fp.poolShare, Math.round(fp.poolMode)); what = r ? `sold a ${full(r.sold)} pool of mortgages for ${full(r.cash)} and kept ${full(r.kept)} of the risk` : 'had no mortgages to sell'; }
  else if (act === 1){ const sold = sellMortgages(); what = sold > 0 ? `sold ${full(sold)} of mortgages` : 'had no mortgages to sell'; }
  else what = 'took no action';
  OUT = null;
  addMail('Finance director', 'Capital below target', `The capital ratio was ${pc(before)}, under your ${pc(cp.capitalTarget)} target. As your capital policy says, we ${what}. The ratio is now ${pc(capRatio())}.`, act === 2 ? 'bad' : '', S.month, S.year);
}
function current(){ return S.queue.find(c => !c.done) || null; }
function optionAllowed(o){ return !(o.cash && S.cash < o.cash); }
function counterQueue(){ return S.queue.filter(c => c.phys && !c.done); }
function inboxActions(){ return S.queue.filter(c => !c.phys); }
function remaining(){ return S.queue.filter(c => !c.done).length; }
function resolveCard(c, k){
  if (!c || c.done) return null;
  begin(); res[c.kind](c, k); c.done = k; if (c.h && c.h.hh != null) hhOutcome(c, k);
  S.qi = S.queue.filter(x => x.done).length;
  const o = OUT; OUT = null; c.out = o; return o;
}
function resolve(k){ return resolveCard(current(), k); }

function closeMonth(){
  begin();
  const m = S.month, u = uf(), rep = { m, events:[] };
  const ev = (t, tone) => say(t, tone);
  let mr = (mktMean(m) + gauss(0, 3)) / 100; if (S.sched.crash === m) mr = -rf(0.07, 0.12);
  mr = clamp(mr, -0.15, 0.12); S.mkt *= 1 + mr; S.lastMkt = mr; S.mktHist.push(Math.round(S.mkt * 10) / 10); if (S.mktHist.length > 36) S.mktHist.shift();
  if (Math.abs(mr) >= 0.04) ev(`Shares ${mr > 0 ? 'rose' : 'fell'} ${pc(Math.abs(mr))} in ${MONTHS[m]}.`, S.wm ? (mr > 0 ? 'good' : 'bad') : '');
  wealthMonth(m, ev);
  // older book (variable rate)
  S.legacyRate = S.base + 2.0;
  post('intLoans', S.legacy * S.legacyRate / 1200);
  swapMonth();
  const am = S.legacy * 0.008; je('legacy.repay', [['cash', am], ['legacy', -am]]);
  const ll = S.legacy * 0.0004 * u; je('legacy.loss', [['legacy', -ll], ['pl.losses', ll]]);
  // new loans
  for (const l of [...S.loans]){
    if (l.status === 'current'){
      post('intLoans', l.bal * l.rate / 1200);
      const a = l.bal * AMORT[l.kind]; je('loan.repay', [['cash', a], ['loans', -a]]); l.bal -= a;
      const pm = (1 - Math.pow(1 - l.pd, 1 / 12)) * AMP * u * (1 + Math.max(0, S.base - S.y0.base) * (P().stress || 0));
      if (l.m0 !== m && R() < pm){ l.status = 'arrears'; l.since = m; l.carded = false; ev(`${l.name} fell behind on their ${KNAME[l.kind]}.`, 'bad'); }
    } else if (l.status === 'plan'){
      post('intLoans', l.bal * l.rate / 2400);
      if (R() < l.cure){ l.status = 'current'; l.pd *= 0.8; ev(`${l.name} is back to full payments.`, 'good'); }
      else if (R() < 0.07 * u){ const loss = writeOff(l, recovery(l)); ev(`${l.name}'s payment plan failed. Written off: ${fmt(loss)}.`, 'bad'); }
    } else if (l.status === 'arrears' && l.carded === false && m - l.since >= 2){
      const loss = writeOff(l, recovery(l)); ev(`${l.name}'s ${KNAME[l.kind]} went to recovery unhandled. Loss: ${fmt(loss)}.`, 'bad'); S.trust = clamp(S.trust - 2, 0, 100);
    }
  }
  for (const g of S.gilts) post('intGilts', g.amt * g.coupon / 1200);
  householdMonth();
  post('intRes', Math.max(0, S.cash) * S.base / 1200);
  post('intDep', -(S.deposits - largeSum()) * S.savRate * 0.6 / 1200);
  for (const d of S.large) post('intDep', -d.amt * d.rate / 1200);
  for (const b of S.bondTranches) post('intDep', -b.amt * b.rate / 1200);
  poolMonth(u);
  if (S.cb > 0) post('intCB', -S.cb * (S.base + 1) / 1200);
  for (const w of S.wsTranches) post('intCB', -w.amt * w.rate / 1200);
  if (upMonthly()) post('costs', -upMonthly());
  post('costs', -(38 - (S.flags.branch === 'closed' ? 10 : S.flags.branch === 'hub' ? 6 : 0)) * Math.pow(Math.max(1, assets() / 16800), 0.5));
  opsMonth(ev);
  if (S.flags.od !== undefined && S.flags.od !== false && S.flags.od < m){
    post('fees', 7); S.flags.odTotal += 7; S.trust = clamp(S.trust - 0.8, 0, 100);
    if (m - S.flags.od >= 3 && R() < 0.3){ post('redress', -(S.flags.odTotal + 25)); S.comp = clamp(S.comp - 12, 0, 100); S.stats.fines += S.flags.odTotal + 25; news(8, 'Regulator orders refunds over unfair overdraft fee', `Customers charged £6 a day for going overdrawn will get ${fmt(S.flags.odTotal)} back.`); ev(`The regulator ruled your overdraft fee unfair. You refund ${fmt(S.flags.odTotal)} and pay a ${fmt(25)} fine.`, 'bad'); S.flags.od = false; }
  }
  // deposit flows
  const fr = clamp(-((P().drain || [])[m] || 0) + 0.012 * (S.savRate - mkt()) + 0.0005 * (S.trust - 55) + (owned('refurb') ? 0.0025 : 0) + (owned('app') ? 0.003 : 0) + gauss(0, 0.003), -0.04, 0.03);
  const flow = S.deposits * fr; je('deposit.flow', [['cash', flow], ['deposits', -flow]]);
  if (Math.abs(flow) >= 10) ev(`Deposits ${flow > 0 ? 'grew' : 'fell'} by ${fmt(Math.abs(flow))}${S.savRate - mkt() > 0.3 && flow > 0 ? ': your savings rate is drawing money in' : S.savRate < mkt() - 0.3 && flow < 0 ? ': savers are finding better rates elsewhere' : ''}.`, flow > 0 ? 'good' : 'bad');
  // delayed consequences
  const due = S.pending.filter(p => p.due <= m); S.pending = S.pending.filter(p => p.due > m);
  for (const p of due){
    if (p.p != null && R() > p.p) continue;
    if (p.news) news(p.news[0], p.news[1], p.news[2]);
    if (p.special){ wealthSpecial(p, ev); continue; }
    if (p.cash){ post(p.key || 'redress', p.cash); if (p.fine) S.stats.fines += -p.cash; }
    if (p.trust) S.trust = clamp(S.trust + p.trust, 0, 100);
    if (p.comp) S.comp = clamp(S.comp + p.comp, 0, 100);
    ev(p.text + (p.cash ? ` (${fmt(p.cash, true)})` : ''), p.tone);
  }
  // dividends: a share of the month's profit, if the player owns capital
  if (S.policy.owner.capital === 'player' && S.policy.capital.dividendPayout > 0){
    const prof = Object.values(S.pl).reduce((a, b) => a + b, 0), amt = S.policy.capital.dividendPayout * prof;
    if (amt > 1){
      je('dividend', [['equity.dividend', amt], ['cash', -amt]]); S.divPaid = (S.divPaid || 0) + amt;
      ev(`Dividend of ${fmt(amt)} paid to shareholders.`, 'good');
      if (capRatio() < MIN_CAP){ S.comp = clamp(S.comp - 5, 0, 100); ev('The regulator objects to a dividend while capital is below the minimum.', 'bad'); }
    }
  }
  // funding plumbing
  if (S.cash < 0){ const need = -S.cash + S.deposits * 0.05; je('boe.draw', [['cash', need], ['cb', -need]]); S.trust = clamp(S.trust - 3, 0, 100); S.stats.emergency++; news(9, 'Counting House forced into emergency borrowing', 'The bank ran out of cash and turned to the Bank of England.'); ev(`You ran out of cash. Emergency borrowing from the Bank of England: ${fmt(need)}.`, 'bad'); }
  else if (S.cb > 0 && liqRatio() > 0.2){ const keep = S.policy.owner.funding === 'player' ? Math.min(S.policy.funding.boeTarget || 0, boeCapacity()) : 0, rpy = Math.min(S.cb - keep, S.cash - 0.15 * S.deposits); if (rpy > 0){ je('boe.repay', [['cb', rpy], ['cash', -rpy]]); ev(`Repaid ${fmt(rpy)} to the Bank of England.`, 'good'); } }
  if (S.trust <= 10){ const run = S.deposits * 0.25; je('deposit.run', [['deposits', run], ['cash', -run]]); ev(`Customers have lost faith. ${fmt(run)} withdrawn in a week.`, 'bad'); if (S.cash < 0){ S.over = 'run'; } }
  // checks
  const cr = capRatio(), lq = liqRatio();
  S.stats.minCap = Math.min(S.stats.minCap, cr);
  if (cr < FAIL_CAP) S.over = 'capital';
  else if (cr < MIN_CAP){ S.comp = clamp(S.comp - 8, 0, 100); S.stats.capBreach++; ev(`Capital ratio ${pc(cr)} is below the ${pc(MIN_CAP)} the regulator requires. They want a plan.`, 'bad'); }
  if (lq < MIN_LIQ){ S.comp = clamp(S.comp - 4, 0, 100); ev(`Liquidity ${pc(lq)} is under the ${pc(MIN_LIQ, 0)} minimum.`, 'bad'); }
  if (S.comp <= 0 && !S.over) S.over = 'licence';
  S.trust = Math.round((S.trust + (55 + (owned('refurb') ? 5 : 0) + (owned('app') ? 3 : 0) - S.trust) * 0.07) * 10) / 10;
  S.rateSum = (S.rateSum || 0) + S.base;
  rep.pl = S.pl; rep.profit = Object.values(S.pl).reduce((a, b) => a + b, 0);
  rep.events = OUT.lines; OUT = null;
  S.last = { pl:S.pl, profit:rep.profit };
  S.history.push({ m, profit: capital() - S.startCap + (S.divPaid || 0) - (S.injected || 0), cap: cr, liq: lq, trust: S.trust, comp: S.comp });
  S.month++;
  if (!S.over && S.month >= 12) S.over = 'done';
  boardMonth(rep); shareMonth();
  if (S.over) S.debrief = makeDebrief();
  evalGoals(S.history[S.history.length - 1], !!S.over);
  if (!S.over) buildMonth();
  rep.next = S.over ? null : { unemp: unemp(), hpi: hpiYr(), base: S.base };
  return rep;
}

/* ---- year-end debrief ----
   Three to five notes from the executive team tying the year's moments to the idea behind each. Each is tagged with
   its PISA content area and the Lusardi and Mitchell question it touches. Ideas the player has seen before are
   ranked lower, so over several years the notes rotate through all of them. Nothing here uses the random stream. */
function makeDebrief(){
  const st = S.stats, seen = S.debriefSeen = S.debriefSeen || {}, cands = [];
  const add = (concept, area, big, weight, what, why, ask) => cands.push({ concept, area, big, weight: weight - 1.5 * (seen[concept] || 0), what, why, ask });
  const infl = inflation(11), bk = giltBook(), mv = giltMV();
  if (bk > 0 && Math.abs(mv / bk - 1) > 0.02)
    add('Bond prices and rates', 'Risk and reward', 'Bond prices fall when rates rise', 4 + Math.abs(mv / bk - 1) * 20,
      `Your gilts ended the year worth ${pc(Math.abs(mv / bk - 1), 0)} ${mv < bk ? 'less' : 'more'} than you paid, because Bank Rate moved from ${S.y0.base.toFixed(2)}% to ${S.base.toFixed(2)}%.${fairValued() && mv < bk ? ' You count gilts at market value, so the fall is already in your capital.' : ''}`,
      'When interest rates rise, existing bonds are worth less, because new ones pay more. The longer the bond, the bigger the move.',
      mv < bk ? 'Would shorter gilts have cost you much income, and how much would they have saved?' : 'Would you still hold long gilts if rates were about to rise?');
  add('Inflation and real returns', 'Money and transactions', 'Inflation', 2.2,
    `Your savers earned ${S.savRate.toFixed(2)}% while prices rose ${infl.toFixed(1)}%, a real return of ${(S.savRate - infl).toFixed(1)}%.`,
    'The real return is the interest rate minus inflation. A positive rate can still buy less next year.',
    S.savRate < infl ? 'Would you keep your own savings at a bank paying this rate?' : 'What would you do with savings that earn more than prices rise?');
  { const r = mRate(80), L = 200, p30 = annuity(L, r, 30), p20 = annuity(L, r, 20);
    add('Mortgage cost over the term', 'Planning and managing finances', 'Mortgage cost over the term', st.loans > 0 ? 2.6 : 1.6,
      `A ${full(L)} mortgage at ${r.toFixed(2)}% costs ${full(p30 * 360 - L)} in interest over 30 years, but ${full(p20 * 240 - L)} over 20.`,
      'A longer term lowers the monthly payment and raises the total cost. The borrower pays for the lower payment in interest.',
      'Who gains from a longer term, the borrower or the bank?'); }
  { const g1 = Math.pow(1.05, 25), g2 = Math.pow(1.04, 25), sr = S.savRate / 100, y10 = 1000 * Math.pow(1 + sr, 10);
    if (S.wm) add('Compound interest and fees', 'Money and transactions', 'Compound interest', 3.2,
      `A fee of 1% a year sounds small. Over 25 years at 5% growth it takes ${pc(1 - g2 / g1, 0)} of what the money would have become.`,
      'Interest and fees both compound: a small yearly amount grows into a large one over a long time.', 'Would your wealth clients understand that when they sign?');
    else add('Compound interest and fees', 'Money and transactions', 'Compound interest', 1.8,
      `At your savings rate of ${S.savRate.toFixed(2)}%, ${full(1)} left untouched for 10 years becomes ${full(y10 / 1000)}.`,
      'Interest earns interest, so money grows faster the longer it stays. The same happens to debt.', 'What would the same pound cost on a card at 24.9%?'); }
  { const tot = loanSum(), mort = loanSum('mortgage'), share = tot > 0 ? mort / tot : 0, big = largeSum() / Math.max(1, S.deposits);
    if (share > 0.65 && tot > 1500) add('Diversification', 'Risk and reward', 'Diversification and risk', 2.4 + share,
      `${pc(share, 0)} of your lending is mortgages, so one fall in house prices would hit most of your book at once.`,
      'Spreading money across different kinds of risk means one bad event cannot take it all.', 'What would you lend more of to balance the book, and what does it cost you?');
    else if (big > 0.2) add('Diversification', 'Risk and reward', 'Diversification and risk', 3 + big * 5,
      `Your largest depositors hold ${pc(big, 0)} of your deposits. One decision could move that money.`,
      'Relying on a few big sources, whether depositors or investments, concentrates the risk.', 'How much of your funding would you let one customer provide?'); }
  if (st.defaults > 0) add('Risk and return', 'Risk and reward', 'Risk and reward', 2.3 + Math.min(2, st.defaults / 4),
    `${st.defaults} loans went bad this year and cost ${fmt(st.losses)}.`,
    'Riskier borrowers are charged more because some will not repay, but a higher rate does not make a risky borrower safer.', 'Which of your approvals would you decide differently now?');
  if (st.emergency > 0) add('Liquidity', 'Financial landscape', 'Risk and reward', 4.2,
    `You ran out of cash ${st.emergency === 1 ? 'once' : st.emergency + ' times'} and had to borrow from the Bank of England.`,
    'A bank can be profitable and still fail if it cannot pay what is due today. Cash and quickly sold assets are the first defence.', 'How much cash would have let you ride it out?');
  if (st.capBreach > 0) add('Capital', 'Financial landscape', 'Risk and reward', 3.6,
    `Your capital ratio fell below the regulator's minimum ${st.capBreach === 1 ? 'once' : st.capBreach + ' times'}.`,
    'Capital is the cushion that absorbs losses before depositors are hurt. Lending more without more capital thins it.', 'Which would you rather give up, some lending or some of the owners\' share?');
  if (S.wholesale > 0 || S.bonds > 0) add('Funding risk', 'Financial landscape', 'Risk and reward', 3.1,
    `${full(S.wholesale + S.bonds)} of your funding is borrowed for a fixed time rather than held as customer deposits.`,
    'Money borrowed for a short time must be renewed. If markets freeze, a bank that relies on it can be forced to sell assets or borrow in an emergency.', 'What falls due in your next six months?');
  if (S.pools.length) add('Selling loans, keeping risk', 'Risk and reward', 'Diversification and risk', 3.3,
    `You have sold mortgages but still hold ${full(S.retained)} of the risk, the first slice of any losses.`,
    'Selling loans frees capital, but whoever keeps the first losses still carries much of the risk.', 'Would you buy a pool from a bank that kept none of it?');
  if (S.flags.od !== undefined && S.flags.od !== false) add('Fees and overdrafts', 'Planning and managing finances', 'Interest rates', 3.4,
    `Your overdraft fee has charged customers ${fmt(S.flags.odTotal || 0)} so far.`,
    'Fees hit hardest the people with the least slack, and a daily fee can cost more than the overdraft itself.', 'Who pays it, and could they afford it?');
  if (st.fines > 0) add('Scams and fraud', 'Money and transactions', 'Risk and reward', 2.8,
    `Fines, refunds and redress cost you ${fmt(st.fines)} this year.`,
    'Fraud and scams are costly for banks and customers. Checks catch some, and slowing a payment can protect a customer.', 'Where would you add a check, and who would it slow down?');
  cands.sort((a, b) => b.weight - a.weight);
  const pick5 = cands.slice(0, Math.min(5, Math.max(3, cands.filter(c => c.weight > 2).length)));
  for (const c of pick5) seen[c.concept] = (seen[c.concept] || 0) + 1;
  return pick5.map(({ concept, area, big, what, why, ask }) => ({ concept, area, big, what, why, ask }));
}
/* ---- operations ----
   Six teams each handle a number of cases per person per month. Demand above capacity joins a backlog, and a backlog ages
   into customer harm and regulatory trouble: unanswered complaints are upheld, unreviewed alerts mean missed fraud and
   missed money laundering, queues cost trust. Hiring takes two months to arrive and one to train; overtime adds 20% for up to
   three months; sustained overload makes people leave. Two thresholds trade detection against false alarms. The change
   programme (five projects, each with a cost, a duration, a benefit and a delivery risk) draws on IT change capacity, and above
   that capacity every month carries a rising chance of an incident. Three suppliers can be outsourced for lower costs, and
   the regulator still holds the bank responsible unless it pays for oversight.
   Until the player takes over operations the executive team runs it well and none of this happens. Uses the game's random
   stream, but only when the player owns operations, so branch play and the golden games are unchanged. */
const OPS_TEAMS = [['counter', 'Counter'], ['credit', 'Credit referrals'], ['fraud', 'Fraud operations'], ['fincrime', 'Financial crime'], ['complaints', 'Complaints'], ['it', 'IT change']];
const OPS_CAP = { counter: 20, credit: 12, fraud: 12, fincrime: 12, complaints: 10, it: 12 };      // cases a person handles in a month; for IT, points of change load
const OPS_DEFAULT = { counter: 6, credit: 3, fraud: 4, fincrime: 3, complaints: 3, it: 3 };
const STAFF_COST = 1.2, HIRE_COST = 1.5, FIRE_COST = 3, HIRE_MONTHS = 3;       // £k a head a month, one off to hire, one off to let go; hires arrive in two months and train for one
const PROJECT_DEFS = {
  core:     { name: 'Core banking migration', field: 'coreMigration', spec: mode => mode === 2 ? { cost: 120, months: 12, load: 20 } : { cost: 160, months: 18, load: 12 } },
  payments: { name: 'Payments upgrade', field: 'paymentsUpgrade', spec: () => ({ cost: 50, months: 9, load: 12 }) },
  reg:      { name: 'Regulatory reporting platform', field: 'regReporting', spec: () => ({ cost: 25, months: 6, load: 8 }) },
  mobile:   { name: 'Mobile app rebuild', field: 'mobileApp', spec: () => ({ cost: 60, months: 9, load: 12 }) },
  data:     { name: 'Data and analytics platform', field: 'dataPlatform', spec: () => ({ cost: 45, months: 9, load: 10 }) },
};
const SUPPLIER_DEFS = { cards: { name: 'Card processing', field: 'outsourceCards', save: 4 }, contact: { name: 'Contact centre', field: 'outsourceContact', save: 3.5 }, hosting: { name: 'IT hosting', field: 'outsourceHosting', save: 5 } };
const opsOwned = () => S.policy.owner.operations === 'player';
// Heads each team needs to run at about 80% of capacity on last month's demand, so the player can see what growth asks for.
function opsRecommended(){
  const O = opsOf(); if (!O.last.length) return Object.assign({}, OPS_DEFAULT);
  const r = Object.assign({}, O.staff); for (const row of O.last) r[row.team] = Math.max(1, Math.ceil(row.demand / (OPS_CAP[row.team] * (O.otActive ? 1.2 : 1) * 0.8)));
  return r;
}
function opsOf(){
  if (!S.ops) S.ops = { staff: Object.assign({}, OPS_DEFAULT), hiring: [], backlog: { counter: 0, credit: 0, fraud: 0, fincrime: 0, complaints: 0 }, ot: 0, otWant: false, otActive: false,
    projects: [], done: {}, incidents: [], iid: 0, last: [], m: null, extraComplaints: 0, sup: { cards: 0, contact: 0, hosting: 0 } };
  return S.ops;
}
const detectRate = (s, bonus) => Math.min(0.99, 1 - Math.pow(1 - s, 1.5) + bonus);       // the share of true cases an alert threshold catches
const staffKey = t => 'staff' + t[0].toUpperCase() + t.slice(1);
const opsHeads = () => OPS_TEAMS.reduce((a, [t]) => a + opsOf().staff[t], 0);

// At the start of each month: hire or let go towards the staffing targets, switch overtime on or off, start and stop projects.
function opsByPolicy(){
  if (!opsOwned() || S.over || S.tutorial || S.scenario) return;
  const O = opsOf(), op = S.policy.operations, now = S.year * 12 + S.month, notes = [];
  for (const [t, label] of OPS_TEAMS){
    const target = op[staffKey(t)], pending = O.hiring.filter(h => h.team === t).reduce((a, h) => a + h.n, 0), have = O.staff[t] + pending;
    if (target > have){ const n = target - have; O.hiring.push({ team: t, n, ready: now + HIRE_MONTHS }); post('costs', -n * HIRE_COST); notes.push(`hiring ${n} for ${label.toLowerCase()} (they arrive in two months and train for a third)`); }
    else if (target < have){
      let cut = have - target;
      for (const h of O.hiring.filter(h => h.team === t)){ const d = Math.min(h.n, cut); h.n -= d; cut -= d; }
      O.hiring = O.hiring.filter(h => h.n > 0);
      if (cut > 0){ O.staff[t] -= cut; post('costs', -cut * FIRE_COST); notes.push(`letting ${cut} go from ${label.toLowerCase()}`); }
    }
  }
  O.otWant = !!op.overtime;
  for (const [key, def] of Object.entries(PROJECT_DEFS)){
    const mode = op[def.field], run = O.projects.find(p => p.key === key);
    if (mode > 0 && !run && !O.done[key]){ const sp = def.spec(mode); O.projects.push({ key, mode, start: now, left: sp.months, months: sp.months, cost: sp.cost, load: sp.load }); notes.push(`starting ${def.name.toLowerCase()}: ${full(sp.cost)} over ${sp.months} months`); }
    else if (mode === 0 && run){ O.projects = O.projects.filter(p => p !== run); notes.push(`stopping ${def.name.toLowerCase()}; the money already spent is lost`); }
  }
  if (notes.length) addMail('Head of operations', 'Operations changes', `Following your settings: ${notes.join('; ')}.`, '', S.month, S.year);
}

function opsIncident(O, kind, cause, cost, trust, comp, complaints, ev){
  post('redress', -cost); S.trust = clamp(S.trust - trust, 0, 100); S.comp = clamp(S.comp - comp, 0, 100); O.extraComplaints += complaints;
  O.incidents.push({ id: ++O.iid, y: S.year, m: S.month, kind, cause, cost }); if (O.incidents.length > 24) O.incidents.shift();
  ev(`${kind === 'outage' ? 'Outage' : kind === 'data' ? 'Data error' : 'Missed regulatory report'}: ${cause}. It cost ${fmt(cost)}.`, 'bad');
  if (kind === 'outage' && cost >= 100) news(8, 'Counting House systems fail for days', 'Customers could not use the bank after a systems change went wrong.');
}

// Each month's work, backlog, losses, people leaving, projects and supplier incidents.
function opsMonth(ev){
  if (!opsOwned() || S.tutorial || S.scenario) return;
  const O = opsOf(), op = S.policy.operations, now = S.year * 12 + S.month, f = Math.sqrt(clamp(S.deposits / 15650, 0.6, 3));      // a bigger bank needs more people, but not in proportion
  for (const h of O.hiring.filter(h => h.ready <= now)) O.staff[h.team] += h.n;
  O.hiring = O.hiring.filter(h => h.ready > now);
  const ot = O.otWant && O.ot < 3; if (ot) O.ot++; else if (!O.otWant) O.ot = 0; O.otActive = ot;
  const bonus = O.done.data ? 0.06 : 0, sF = op.fraudSensitivity, sA = op.amlSensitivity, noise = () => 0.92 + 0.16 * R();
  const trueF = 10 * f * noise(), tAF = trueF * detectRate(sF, bonus), fAF = 120 * f * sF * sF * noise();
  const trueA = 2 * f * noise(), tAA = trueA * detectRate(sA, bonus), fAA = 80 * f * sA * sA * noise();
  const D = { counter: 90 * f * noise() * (O.done.mobile ? 0.85 : 1), credit: 27 * f * noise() * (S.policy.owner.credit === 'player' ? 1.5 : 1), fraud: tAF + fAF, fincrime: tAA + fAA,
    complaints: 14 * f * (1 + 0.8 * (unemp() / 4.3 - 1)) + 0.15 * (fAF + fAA) + 0.4 * S.loans.filter(l => l.status === 'arrears').length + O.extraComplaints };
  O.extraComplaints = 0;
  const rows = [], x = {}, load = {}, age = {};
  for (const [t] of OPS_TEAMS){
    if (t === 'it') continue;
    const cap = O.staff[t] * OPS_CAP[t] * (ot ? 1.2 : 1), work = O.backlog[t] + D[t], done = Math.min(work, cap), left = work - done;
    x[t] = work > 0 ? left / work : 0; load[t] = D[t] / Math.max(1, cap); O.backlog[t] = left; age[t] = left / Math.max(1, cap);
    rows.push({ team: t, staff: O.staff[t], demand: Math.round(D[t] * 10) / 10, cap: Math.round(cap * 10) / 10, backlog: Math.round(left * 10) / 10, util: Math.round(load[t] * 1000) / 1000 });
  }
  // what unmet work costs
  S.trust = clamp(S.trust - Math.min(2.5, x.counter * 10) - Math.min(1.5, x.credit * 6), 0, 100);
  const pF = 1 - x.fraud, caughtF = tAF * pF, missedF = Math.max(0, trueF - caughtF), blocked = fAF * pF;
  const baseF = 10 * f * (1 - detectRate(0.5, 0)), baseA = 2 * f * (1 - detectRate(0.5, 0));      // what the executive team's plan misses; the bank's normal losses already include it
  post('redress', -(missedF - baseF) * 0.9); S.trust = clamp(S.trust - Math.min(2, blocked / (60 * f)), 0, 100);
  const pA = 1 - x.fincrime, missedA = Math.max(0, trueA - tAA * pA), unreviewed = (tAA + fAA) * x.fincrime, fines = Math.max(0, missedA - baseA) * 0.4;
  for (let i = 0, n = Math.floor(fines) + (R() < fines - Math.floor(fines) ? 1 : 0); i < n; i++)
    later(3, { text: 'The regulator fines us for money laundering we missed', cash: -30, key: 'redress', fine: true, comp: -4, tone: 'bad', news: [6, 'Counting House fined over money laundering checks', 'The regulator says alerts were closed without being properly reviewed.'] });
  const capC = O.staff.complaints * OPS_CAP.complaints * (ot ? 1.2 : 1), overdue = Math.max(0, O.backlog.complaints - 2 * capC);
  if (overdue > 0.5){ O.backlog.complaints -= overdue; post('redress', -overdue * 0.8); S.trust = clamp(S.trust - Math.min(2, overdue / 10), 0, 100); S.comp = clamp(S.comp - Math.min(3, overdue / 10), 0, 100); S.stats.fines += overdue * 0.8; ev(`${Math.round(overdue)} complaints went unanswered for over eight weeks and were upheld.`, 'bad'); }
  // people leave when the work is too much
  for (const [t, label] of OPS_TEAMS){
    const l = t === 'it' ? 0 : load[t], exp = O.staff[t] * (0.012 + 0.07 * Math.max(0, l - 1) + (O.ot >= 3 ? 0.02 : 0)), n = Math.floor(exp) + (R() < exp - Math.floor(exp) ? 1 : 0);
    if (n > 0 && O.staff[t] - n >= 1){ O.staff[t] -= n; if (l > 1) ev(`${n} left ${label.toLowerCase()}, worn down by the workload.`, 'bad'); }
  }
  // the change programme
  const limit = O.staff.it * OPS_CAP.it, projLoad = O.projects.reduce((a, p) => a + p.load, 0), meter = projLoad / Math.max(1, limit);
  let spend = 0;
  for (const p of [...O.projects]){
    spend += p.cost / p.months; p.left -= meter > 1 ? 0.5 : 1;
    if (p.left <= 0){
      O.projects = O.projects.filter(q => q !== p); O.done[p.key] = now; const def = PROJECT_DEFS[p.key];
      addMail('Head of operations', `${def.name} complete`, p.key === 'core' ? 'The migration is finished. Running costs fall by about £6k a month.' : p.key === 'payments' ? 'Payments are upgraded: fewer failed payments and faster fraud checks.' : p.key === 'reg' ? 'The reporting platform is live, so a missed regulatory report is much less likely.' : p.key === 'mobile' ? 'The new app is live. Fewer customers need the counter, though there are launch defects to deal with.' : 'The data platform is live. Fraud and money laundering scoring is a little better.', 'good', S.month, S.year);
      if (p.key === 'core' && R() < (p.mode === 2 ? 0.3 : 0.05)) opsIncident(O, 'outage', p.mode === 2 ? 'the big-bang cutover failed and customers were locked out for days' : 'the phased cutover had a bad weekend', p.mode === 2 ? 150 : 40, p.mode === 2 ? 8 : 2, p.mode === 2 ? 8 : 2, 20, ev);
      if (p.key === 'payments' && R() < 0.12) opsIncident(O, 'outage', 'payments failed during the switchover', 60, 3, 4, 10, ev);
      if (p.key === 'mobile') O.extraComplaints += 25;
    }
  }
  if (meter > 1 && R() < Math.min(0.6, 0.12 + 0.3 * (meter - 1))){
    const r = R();
    if (r < 0.5) opsIncident(O, 'outage', 'too much change at once and not enough IT staff', 60, 3, 4, 8, ev);
    else if (r < 0.8) opsIncident(O, 'data', 'a rushed release corrupted a batch of records', 25, 1, 1, 15, ev);
    else if (R() < (O.done.reg ? 0.4 : 1)) opsIncident(O, 'report', 'the team was too stretched to file on time', 40, 0, 6, 0, ev);
  }
  // suppliers
  let saving = 0, oversight = 0, supInc = 0;
  for (const [k, def] of Object.entries(SUPPLIER_DEFS)){
    if (!(op[def.field] > 0)) continue;
    saving += def.save; oversight += op.oversight;
    const p = 0.05 * (1 - Math.min(0.8, op.oversight / 5)), mult = 1 - Math.min(0.6, op.oversight / 6);
    if (R() < p){ O.sup[k]++; opsIncident(O, 'outage', `${def.name.toLowerCase()} supplier failed, and the regulator holds us responsible`, 100 * mult, 3 * mult, 6 * mult, 10, ev); }
  }
  supInc = O.incidents.filter(i => /supplier/.test(i.cause) && (S.year * 12 + S.month) - (i.y * 12 + i.m) < 12).length;
  // what it all costs, against the executive team's plan
  const heads = opsHeads(), defaultHeads = OPS_TEAMS.reduce((a, [t]) => a + OPS_DEFAULT[t], 0);
  post('costs', -((heads - defaultHeads) * STAFF_COST + (ot ? heads * STAFF_COST * 0.5 : 0) + spend + oversight - saving - (O.done.core ? 6 : 0)));
  const fr = { trueCases: Math.round(trueF * 10) / 10, caught: Math.round(caughtF * 10) / 10, missed: Math.round(missedF * 10) / 10, falseAlerts: Math.round(fAF * 10) / 10 };
  O.last = rows;
  O.m = { load, age, fraud: fr, falseRate: fAF / Math.max(1, tAF + fAF), alertsPer: (D.fraud + D.fincrime) / Math.max(1, O.staff.fraud + O.staff.fincrime), unreviewed: Math.round(unreviewed * 10) / 10, meter, limit, supInc, missedA: Math.round(missedA * 100) / 100, overdue: Math.round(overdue * 10) / 10 };
}

/* ---- Bank of England facility ----
   The central bank lends against the loan book at Bank Rate plus 1%, after a haircut on the collateral. It is always
   available, which is the trap: using it shows in the Herald and costs the chief executive the board's confidence for as long
   as the money is out. Owning funding, the player sets how much to keep drawn; the standing rule draws up to it (within
   the collateral) and repays down to it. Forced emergency borrowing when cash runs out is separate and works as before. */
const BOE_HAIRCUT = 0.3;
const boeCapacity = () => (1 - BOE_HAIRCUT) * (S.legacy + loanSum());
function boeFacility(){
  if (S.policy.owner.funding !== 'player' || S.over || S.tutorial || S.scenario) return;
  const want = Math.min(S.policy.funding.boeTarget || 0, boeCapacity());
  if (S.cb < want - 24){
    const d = Math.floor((want - S.cb) / 25) * 25;
    je('boe.draw', [['cash', d], ['cb', -d]]); S.stats.boe++;
    addMail('Your treasurer', 'Bank of England borrowing', `We have drawn ${full(d)} from the Bank of England, which now holds ${full(S.cb)} of our loans as collateral (after a ${pc(BOE_HAIRCUT, 0)} haircut we could borrow ${full(boeCapacity())}). It costs Bank Rate plus 1%, and the board does not like to see it.`, 'bad', S.month, S.year);
    if (!(S.news || []).some(n => /borrows from the Bank of England/.test(n.head))) news(6, 'Counting House borrows from the Bank of England', 'The bank has turned to the central bank for funding, which some investors read as a sign of weakness.');
  } else if (S.cb > want + 24){
    const rp = Math.floor(Math.min(S.cb - want, S.cash - 0.15 * S.deposits) / 25) * 25;
    if (rp >= 25){ je('boe.repay', [['cb', rp], ['cash', -rp]]); addMail('Your treasurer', 'Bank of England repaid', `We repaid ${full(rp)} to the Bank of England. ${S.cb > 0.5 ? full(S.cb) + ' is still drawn.' : 'Nothing is drawn now.'}`, 'good', S.month, S.year); }
  }
}

/* ---- share price ----
   Book value per share times a multiple. The multiple rises when return on equity beats the cost of equity (10%) and falls
   with volatile profits and with trouble: enforcement and a capital breach. It is smoothed, so one month does not move it
   far. Issuing shares at a discount to the price creates more shares, which dilutes everyone who held them before. */
const COST_OF_EQUITY = 0.10, SHARES0 = 1000;      // thousands of shares, so capital in £k over shares is pounds per share
const pxOf = () => S.px = S.px || { shares: SHARES0, mult: null, hist: [], issues: [] };
const bookPerShare = () => capital() / pxOf().shares;
const sharePrice = () => Math.max(0.01, bookPerShare() * (pxOf().mult == null ? 1 : pxOf().mult));
function shareMonth(){
  if (S.sim || !ceMode()) return;
  const P = pxOf(), k = Math.max(1, S.month), r = rating(), roe = COST_OF_EQUITY + (r.roe * 12 / k - COST_OF_EQUITY) * Math.min(1, k / 6);      // a few months of profit say little about the year
  const ps = S.history.map((h, i) => h.profit - (i ? S.history[i - 1].profit : 0)).slice(-12), mean = ps.reduce((a, b) => a + b, 0) / Math.max(1, ps.length);
  const vol = Math.sqrt(ps.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, ps.length)) * Math.sqrt(12) / Math.max(1, capital());
  const trouble = (S.comp < 40 ? 0.3 : 0) + (capRatio() < MIN_CAP ? 0.2 : 0);
  const target = clamp(1 + 4 * (roe - COST_OF_EQUITY) - 2 * vol - trouble, 0.4, 2.5);
  P.mult = 0.75 * (P.mult == null ? 1 : P.mult) + 0.25 * target;
  P.hist.push({ y: S.year, m: Math.max(0, S.month - 1), price: Math.round(sharePrice() * 1000) / 1000, book: Math.round(bookPerShare() * 1000) / 1000, mult: Math.round(P.mult * 1000) / 1000 });
  if (P.hist.length > 36) P.hist.shift();
}

// Everything the bank has borrowed, one row each: wholesale loans and bonds with their terms, and the Bank of England as a
// single running facility (on demand, so no maturity).
function fundingInstruments(){
  const out = [];
  for (const w of S.wsTranches || []) out.push({ id: 'ws' + (w.id != null ? w.id : '-' + w.due + '-' + w.amt), kind: 'wholesale', amt: w.amt, rate: w.rate, start: w.start != null ? w.start : null, due: w.due });
  for (const b of S.bondTranches || []) out.push({ id: 'bond' + (b.id != null ? b.id : '-' + b.due + '-' + b.amt), kind: 'bond', amt: b.amt, rate: b.rate, start: b.start != null ? b.start : null, due: b.due });
  if ((S.cb || 0) > 0.005) out.push({ id: 'boe', kind: 'boe', amt: S.cb, rate: Math.round((S.base + 1) * 100) / 100, start: null, due: null });
  return out;
}

/* ---- interest-rate hedging ----
   New mortgages are lent at a fixed rate while savers and wholesale lenders are paid something that follows Bank Rate, so a
   rise in rates squeezes the margin. A pay-fixed swap pays a fixed rate on a notional amount and receives Bank Rate, which
   offsets the squeeze. Each month the net payment is a profit or loss (pl.swaps). The swap's value is not in capital,
   but when it is worth less than nothing the bank must post the shortfall as cash collateral, which is not liquid, and the
   cash is returned as the value recovers or the swap ends. Over-hedge and a rate cut brings payments and collateral calls
   on a book that is no longer there. Swaps cannot be cancelled; they run to their end even if treasury is handed back. */
const SWAP_SPREAD = 0.1;
const swapRate = years => S.base + SWAP_SPREAD + 0.15 * (years - 1);
const swapNotional = () => (S.swaps || []).reduce((a, w) => a + w.n, 0);
const swapMTM = () => (S.swaps || []).reduce((a, w) => a + w.n * (S.base - w.k) / 100 * Math.max(0, w.due - (S.year * 12 + S.month)) / 12, 0);
function swapMonth(){
  if (!S.swaps || !S.swaps.length) { if (S.collateral > 0) collateralTo(0); return; }
  const now = S.year * 12 + S.month;
  let net = 0; for (const w of S.swaps) net += w.n * (S.base - w.k) / 1200;
  S.pl.swaps = S.pl.swaps || 0;
  if (Math.abs(net) > 1e-9) post('swaps', net);
  S.swaps = S.swaps.filter(w => w.due > now);
  collateralTo(Math.max(0, -swapMTM()));
}
function collateralTo(target){
  const d = Math.round((target - (S.collateral || 0)) * 1e6) / 1e6;
  if (Math.abs(d) < 1e-6) return;
  je(d > 0 ? 'collateral.call' : 'collateral.return', [['collateral', d], ['cash', -d]]);
}
function hedgeByPolicy(){
  const tp = S.policy.treasury;
  if (!(tp.hedgeTarget > 0)) return;
  const book = loanSum('mortgage'), want = tp.hedgeTarget * book, have = swapNotional(), gap = want - have;
  if (gap < 250) return;
  const n = Math.floor(gap / 250) * 250, yrs = Math.round(tp.hedgeYears), k = Math.round(swapRate(yrs) * 100) / 100;
  S.swaps.push({ id: (S.swapId = (S.swapId || 0) + 1), n, k, years: yrs, start: S.year * 12 + S.month, due: S.year * 12 + S.month + yrs * 12 });
  addMail('Your treasurer', 'Interest-rate swap entered', `We now pay ${k.toFixed(2)}% fixed and receive Bank Rate on ${full(n)} for ${yrs} year${yrs === 1 ? '' : 's'}, to protect the margin on your fixed-rate mortgages (${full(book)}). If rates fall we pay, and we may have to post cash as collateral. It cannot be cancelled.`, '', S.month, S.year);
}

/* ---- maturity ladder ----
   Every contractual inflow and outflow, bucketed by when it falls due: loans repaying against wholesale and bond
   funding maturing. The stressed run on deposits is shown separately because it is an assumption, not a contract. */
const LADDER = [['m1', 'Within a month', 0, 1], ['m3', '1 to 3 months', 1, 3], ['m6', '3 to 6 months', 3, 6], ['m12', '6 to 12 months', 6, 12], ['y1', 'Over a year', 12, Infinity]];
function maturityLadder(){
  const now = S.year * 12 + S.month, rows = LADDER.map(([key, label, lo, hi]) => ({ key, label, lo, hi, inflow: 0, outflow: 0 }));
  const put = (m, field, amt) => { const r = rows.find(x => m > x.lo - 0 && m <= x.hi) || rows[0]; r[field] += amt; };
  // principal repaying on the older book and on named loans: a fixed share of what is left each month, then whatever remains
  const runoff = (bal, rate) => { let left = bal; for (let i = 1; i <= 12; i++){ const p = left * rate; put(i, 'inflow', p); left -= p; } rows[4].inflow += left; };
  runoff(S.legacy, 0.008); for (const l of S.loans) if (l.status !== 'plan') runoff(l.bal, AMORT[l.kind] || 0.01);
  for (const w of S.wsTranches || []) put(Math.max(1, w.due - now), 'outflow', w.amt);
  for (const b of S.bondTranches || []) put(Math.max(1, b.due - now), 'outflow', b.amt);
  const large = largeSum(), stressRun = 0.05 * (S.deposits - large) + large, liquid = S.cash + giltMV();
  let cum = 0; for (const r of rows){ r.net = r.inflow - r.outflow; cum += r.net; r.cum = cum; r.cover = liquid + cum - stressRun; }
  return { rows, liquid, stressRun, lcr: liquid / Math.max(1, stressRun + rows[0].outflow), collateral: S.collateral || 0 };
}

/* ---- executive team, early warnings and the stress test ----
   Everything here is read-only except runStress, which stores its result, and warnMonth, which writes mail. None of it
   uses the game's random stream, so it cannot change how a game plays out. It only applies once the player has been
   handed a Chief Executive area, so branch-manager play is untouched. */
const CE_AREAS = ['pricing', 'credit', 'treasury', 'funding', 'capital', 'operations'];
const ceMode = () => !!(S.progress && S.progress.unlocked.some(a => CE_AREAS.includes(a)));
const LEVEL = { ok: 0, watch: 1, alarm: 2 };
const band = (v, watch, alarm) => v >= alarm ? 'alarm' : v >= watch ? 'watch' : 'ok';
const bandLow = (v, watch, alarm) => v <= alarm ? 'alarm' : v <= watch ? 'watch' : 'ok';

// Days the bank could pay out in a severe run: 5% of ordinary deposits and every large depositor in a month, plus any
// wholesale money falling due, set against cash and gilts at market value. Bank of England borrowing is not counted.
function survivalHorizon(){
  const now = S.year * 12 + S.month, large = largeSum(), retail = S.deposits - large;
  const dueNow = (S.wsTranches || []).filter(w => w.due <= now + 1).reduce((a, w) => a + w.amt, 0);
  const out30 = 0.05 * retail + large + dueNow;
  return out30 > 0 ? clamp(Math.round(30 * (S.cash + giltMV()) / out30), 0, 365) : 365;
}
// Change in a year's net interest income if Bank Rate rose one point: reserves, the older book and pay-fixed swaps reprice at once,
// short gilts half, new fixed-rate loans not at all; savers follow at half (all the way once funding is yours), wholesale fully.
function rateSensitivity(){
  const beta = S.policy.owner.funding === 'player' ? 1 : 0.5, shortG = S.gilts.filter(g => g.kind === 'short').reduce((a, g) => a + g.amt, 0);
  return 0.01 * (S.cash + S.legacy + 0.5 * shortG + swapNotional() - beta * S.deposits - (S.wholesale || 0));
}
function indicators(){
  const now = S.year * 12 + S.month, dep = S.deposits, fund = dep + S.wholesale + (S.bonds || 0), liquid = S.cash + giltMV();
  const book = S.legacy + loanSum(), cr = capRatio(), lq = liqRatio();
  const wDue = (S.wsTranches || []).filter(w => w.due <= now + 6).reduce((a, w) => a + w.amt, 0), bDue = (S.bondTranches || []).filter(x => x.due <= now + 6).reduce((a, x) => a + x.amt, 0);
  const wall = (wDue + bDue) / Math.max(1, liquid), large = largeSum() / Math.max(1, dep), wShare = S.wholesale / Math.max(1, fund);
  const bad = S.loans.filter(l => l.status === 'arrears' || l.status === 'plan').reduce((a, l) => a + l.bal, 0) / Math.max(1, book);
  const risky = S.loans.filter(l => l.pd >= RISKY_PD).reduce((a, l) => a + l.bal, 0) / Math.max(1, book);
  const horizon = survivalHorizon(), sens = rateSensitivity(), cap = capital();
  const mortBook = loanSum('mortgage'), hedgeRatio = mortBook > 0 ? swapNotional() / mortBook : swapNotional() > 0 ? 9 : 0, coll = S.collateral || 0;
  const worst = maturityLadder().rows.reduce((a, r) => r.cover < a.cover ? r : a);
  const sensStatus = sens < 0 ? band(-sens / Math.max(1, cap), 0.03, 0.08) : 'ok';
  const list = [
    { key: 'capital', role: 'Chief risk officer', label: 'Capital buffer', value: cr - MIN_CAP, shown: pc(cr) + ' (' + (cr >= MIN_CAP ? '+' : '') + pc(cr - MIN_CAP) + ' on the minimum)', status: bandLow(cr - MIN_CAP, 0.03, 0.01),
      text: `Capital ratio ${pc(cr)}; the regulator steps in below ${pc(MIN_CAP)}.` },
    { key: 'liquidity', role: 'Treasurer', label: 'Liquidity ratio', value: lq, shown: pc(lq, 0), status: bandLow(lq, 0.2, 0.12), text: `Cash and gilts are ${pc(lq, 0)} of deposits and wholesale funding; the minimum is ${pc(MIN_LIQ, 0)}.` },
    { key: 'horizon', role: 'Treasurer', label: 'Survival horizon', value: horizon, shown: horizon >= 365 ? '1 year or more' : horizon + ' days', status: bandLow(horizon, 120, 90),
      text: `In a severe run the bank could pay out for about ${horizon >= 365 ? 'a year' : horizon + ' days'} before cash runs out. Below 90 days is dangerous.` },
    { key: 'wholesale', role: 'Treasurer', label: 'Wholesale share of funding', value: wShare, shown: pc(wShare, 0), status: band(wShare, 0.15, 0.25), text: `${pc(wShare, 0)} of funding is borrowed from other banks, which can refuse to renew in a freeze.` },
    { key: 'wall', role: 'Treasurer', label: 'Maturity wall, next 6 months', value: wall, shown: pc(wall, 0) + ' of liquid assets', status: band(wall, 0.25, 0.5), text: `${fmt(wDue + bDue)} of wholesale and bond funding falls due within six months, ${pc(wall, 0)} of the cash and gilts you hold.` },
    { key: 'large', role: 'Treasurer', label: 'Large depositor share', value: large, shown: pc(large, 0), status: band(large, 0.1, 0.25), text: `Large depositors hold ${pc(large, 0)} of deposits. One decision can move all of it.` },
    { key: 'arrears', role: 'Chief risk officer', label: 'Loans behind with payments', value: bad, shown: pc(bad), status: band(bad, 0.03, 0.06), text: `${pc(bad)} of the loan book is behind on payments. Losses follow arrears by a month or two.` },
    { key: 'risky', role: 'Chief risk officer', label: 'Riskiest lending', value: risky, shown: pc(risky, 0), status: band(risky, 0.15, 0.3), text: `${pc(risky, 0)} of the loan book is lent to borrowers with a high chance of default.` },
    { key: 'boe', role: 'Treasurer', label: 'Bank of England borrowing', value: (S.cb || 0) / Math.max(1, boeCapacity()), shown: (S.cb || 0) > 0.5 ? fmt(S.cb) + ' of ' + fmt(boeCapacity()) + ' available' : 'none drawn (' + fmt(boeCapacity()) + ' available)', status: (S.cb || 0) > 0.5 ? ((S.cb || 0) > 0.5 * boeCapacity() ? 'alarm' : 'watch') : 'ok',
      text: `${fmt(S.cb || 0)} is borrowed from the Bank of England, at Bank Rate plus 1%. It shows in the Herald and costs board confidence for as long as it is out. It is always there, which is why it is tempting.` },
    { key: 'hedge', role: 'Treasurer', label: 'Swap cover of fixed mortgages', value: hedgeRatio, shown: swapNotional() > 0 || mortBook > 0 ? pc(hedgeRatio, 0) + ' hedged (' + fmt(swapNotional()) + ' of swaps)' : 'no fixed mortgages', status: hedgeRatio > 1.1 ? 'alarm' : hedgeRatio > 1.0 ? 'watch' : 'ok',
      text: hedgeRatio > 1 ? `Swaps cover ${pc(hedgeRatio, 0)} of the fixed-rate mortgage book. Anything above 100% is a bet on rates rising: a rate cut brings payments and collateral calls on a book that is not there.` : `Swaps cover ${pc(hedgeRatio, 0)} of the ${fmt(mortBook)} fixed-rate mortgage book.` },
    { key: 'collateral', role: 'Treasurer', label: 'Collateral posted on swaps', value: coll / Math.max(1, liquid), shown: fmt(coll) + ' (' + pc(coll / Math.max(1, liquid), 0) + ' of liquid assets)', status: band(coll / Math.max(1, liquid), 0.1, 0.25),
      text: `${fmt(coll)} of cash is tied up as collateral on swaps, so it cannot meet withdrawals. It comes back as the swaps recover or end.` },
    { key: 'ladder', role: 'Treasurer', label: 'Funding gap by maturity', value: worst.cover / Math.max(1, liquid), shown: worst.cover < 0 ? 'short by ' + fmt(-worst.cover) + ', ' + worst.label.toLowerCase() : 'covered in every bucket', status: worst.cover < 0 ? 'alarm' : worst.cover < 0.25 * liquid ? 'watch' : 'ok',
      text: worst.cover < 0 ? `By the ${worst.label.toLowerCase()} bucket, what falls due plus a stressed run on deposits exceeds cash, gilts and loan repayments by ${fmt(-worst.cover)}.` : `Cash, gilts and loan repayments cover every maturity bucket after a stressed run. The tightest is ${worst.label.toLowerCase()}.` },
    { key: 'rates', role: 'Treasurer', label: 'Interest-rate sensitivity', value: sens, shown: (sens >= 0 ? '+' : '−') + fmt(Math.abs(sens)) + ' a year for +1 point', status: sensStatus,
      text: sens >= 0 ? `A one-point rise in Bank Rate would add about ${fmt(sens)} to a year's net interest income.` : `A one-point rise in Bank Rate would cut a year's net interest income by about ${fmt(-sens)}: more of your funding reprices than your assets.` },
  ];
  return list.concat(opsIndicators());
}
// Early warnings from operations, only once the player runs it. The trouble they show comes months before the losses.
function opsIndicators(){
  if (!opsOwned() || !S.ops || !S.ops.m) return [];
  const O = S.ops, m = O.m, worst = (o) => Object.entries(o).reduce((a, [k, v]) => v > a[1] ? [k, v] : a, ['', -1]);
  const lab = Object.fromEntries(OPS_TEAMS), [lt, lv] = worst(m.load), [at, av] = worst(m.age);
  return [
    { key: 'util', role: 'Head of operations', label: 'Team utilisation, busiest', value: lv, shown: pc(lv, 0) + ' (' + lab[lt].toLowerCase() + ')', status: band(lv, 0.95, 1.1), text: `${lab[lt]} is running at ${pc(lv, 0)} of capacity. Above 100% work piles up, and people start to leave.` },
    { key: 'age', role: 'Head of operations', label: 'Oldest case, longest', value: av, shown: av < 0.05 ? 'no backlog' : av.toFixed(1) + ' months (' + lab[at].toLowerCase() + ')', status: band(av, 0.5, 2), text: `The ${lab[at].toLowerCase()} backlog is ${av.toFixed(1)} months of work. Complaints over eight weeks old are upheld; old alerts are closed without review.` },
    { key: 'alerts', role: 'Head of operations', label: 'Alerts per analyst', value: m.alertsPer, shown: m.alertsPer.toFixed(1) + ' a month', status: band(m.alertsPer, 10, 14), text: `Each fraud and financial crime analyst has ${m.alertsPer.toFixed(1)} alerts a month. Above about 12 they cannot review each one properly.` },
    { key: 'falsealarm', role: 'Chief risk officer', label: 'False-alarm rate, fraud', value: m.falseRate, shown: pc(m.falseRate, 0), status: band(m.falseRate, 0.85, 0.93), text: `${pc(m.falseRate, 0)} of fraud alerts are genuine customers. A very sensitive threshold blocks payments and swamps the analysts.` },
    { key: 'unreviewed', role: 'Chief risk officer', label: 'Alerts closed without review', value: m.unreviewed, shown: m.unreviewed.toFixed(1) + ' this month', status: band(m.unreviewed, 1, 5), text: `${m.unreviewed.toFixed(1)} money-laundering alerts were closed unreviewed this month. That is how laundering is missed, and the fine arrives months later.` },
    { key: 'change', role: 'Head of operations', label: 'Change capacity meter', value: m.meter, shown: pc(m.meter, 0) + ' of IT capacity', status: band(m.meter, 0.85, 1.0001), text: `Running projects use ${pc(m.meter, 0)} of what your IT staff can deliver. Above 100% every month carries a rising chance of an outage or a data error.` },
    { key: 'suppliers', role: 'Head of operations', label: 'Supplier incidents, last year', value: m.supInc, shown: String(m.supInc), status: band(m.supInc, 1, 3), text: `${m.supInc} supplier failure${m.supInc === 1 ? '' : 's'} in the last year. The regulator holds the bank responsible, and oversight spending reduces both the chance and the harm.` },
  ];
}
const RISKY_PD = 0.08;

// The executive team: four advisers who read the same numbers from different seats, so they often disagree.
function advisers(){
  const I = Object.fromEntries(indicators().map(i => [i.key, i])), P = S.policy, sys = systemPolicy(), own = a => P.owner[a] === 'player';
  const m = metrics(), cr = capRatio(), lq = liqRatio(), notes = [];
  const add = (role, tone, text) => notes.push({ role, tone, text });
  const L = S.last ? S.last.pl : null, inc = L ? L.intLoans + L.intGilts + L.intRes + L.intDep + L.intCB + L.fees + (L.wealth || 0) : 0, ci = L && inc > 0 ? -L.costs / inc : null;
  const st = S.stress;

  // Finance director: profit, cost/income, the dividend
  if (S.month >= 2 && m.profit < 0) add('Finance director', 'warn', `We are ${fmt(-m.profit)} down for the year. Look at what we charge and what our funding costs.`);
  else if (m.profit > 0) add('Finance director', 'info', `Profit is ${fmt(m.profit)} for the year so far.${ci != null ? ` Costs take ${pc(ci, 0)} of income.` : ''}`);
  if (ci != null && ci > 0.7) add('Finance director', 'warn', `Costs take ${pc(ci, 0)} of income. Above 70% the board will ask why.`);
  if (S.px && S.px.mult != null){
    const px = sharePrice(), bv = bookPerShare();
    if (S.px.mult < 0.8) add('Finance director', 'warn', `The shares trade at £${px.toFixed(2)}, ${pc(1 - S.px.mult, 0)} below book value of £${bv.toFixed(2)}. Investors doubt the returns. Raising capital now would be expensive and would dilute holders.`);
    else if (S.px.mult > 1.3) add('Finance director', 'info', `The shares trade at £${px.toFixed(2)}, ${pc(S.px.mult - 1, 0)} above book value. If we need capital, this is the time to raise it.`);
  }
  if (own('capital') && P.capital.capitalAction === 0){ const dil = P.capital.raiseAmount / (capital() + P.capital.raiseAmount); add('Finance director', 'info', `If capital falls below your target we raise ${fmt(P.capital.raiseAmount)} at about £${(sharePrice() * 0.9).toFixed(2)} a share, a ${pc(dil, 0)} dilution for existing holders.`); }
  if (S.board && S.board.conf < 45) add('Finance director', 'alarm', `The board's confidence is ${Math.round(S.board.conf)}. ${S.board.low > 0 ? 'It was below 20 at the last meeting. ' : ''}Below 20 at two meetings in a row and you are out.`);
  if (own('capital')){
    const d = P.capital.dividendPayout;
    if (d === 0 && m.profit > 0 && cr > P.capital.capitalTarget + 0.02) add('Finance director', 'info', `Shareholders expect a dividend and we can afford one. Paying out ${pc(0.3, 0)} of profit would be about ${fmt(0.3 * m.profit)} a year. The chief risk officer will not like it.`);
    else if (d > 0.6 && cr < P.capital.capitalTarget + 0.02) add('Finance director', 'warn', `A ${pc(d, 0)} payout leaves little capital. A downturn would force a share issue at the worst price.`);
  }
  if (own('pricing')){
    const sp = P.pricing.mortgageSpread - sys.pricing.mortgageSpread;
    if (sp < -0.3) add('Finance director', 'warn', `Mortgages are priced ${Math.abs(sp).toFixed(2)} points under the executive team's spread. Volume will rise, but one bad year of defaults wipes out the margin.`);
    else if (sp > 0.4) add('Finance director', 'info', `Mortgages are priced ${sp.toFixed(2)} points over the executive team's spread. Customers will go elsewhere, and those who stay are riskier.`);
  }
  if (lq > 0.35 && I.horizon.status === 'ok') add('Finance director', 'info', `We hold more liquid assets than we need (${pc(lq, 0)}). Lending or buying gilts would add yield. The treasurer disagrees.`);
  const pushback = lq > 0.35 && I.horizon.status === 'ok';

  // Chief risk officer: credit losses, limits and the stress test
  if (I.arrears.status !== 'ok') add('Chief risk officer', I.arrears.status === 'alarm' ? 'alarm' : 'warn', `${I.arrears.text} Check how much we lend to people who show warning signs.`);
  if (I.risky.status !== 'ok') add('Chief risk officer', 'warn', I.risky.text);
  if (own('credit')){
    const c = P.credit;
    if (c.mortgageMaxLtv > sys.credit.mortgageMaxLtv || c.mortgageMinScore < sys.credit.mortgageMinScore - 40 || c.mortgageMaxLti > sys.credit.mortgageMaxLti)
      add('Chief risk officer', 'warn', `Your credit rules are looser than the executive team's. When house prices fall, loans end up larger than the homes behind them.`);
    else if (c.mortgageMaxLtv < 80 && c.mortgageMinScore > 650) add('Chief risk officer', 'info', `Your rules are tight. Losses will be low, but the finance director will say we are turning away good customers.`);
  }
  if (st){
    if (st.failed) add('Chief risk officer', 'alarm', `In the last stress test the bank failed: ${st.why}. Do not carry these settings into a recession.`);
    else if (st.lowCap < MIN_CAP) add('Chief risk officer', 'alarm', `In the last stress test capital fell to ${pc(st.lowCap)} in month ${st.lowCapMonth}, below the ${pc(MIN_CAP)} minimum.`);
    else add('Chief risk officer', 'info', `In the last stress test capital stayed above the minimum: its low point was ${pc(st.lowCap)} in month ${st.lowCapMonth}.`);
  } else add('Chief risk officer', 'info', `You have not run a stress test. Run one before changing credit or capital settings.`);

  // Treasurer: liquidity, funding and interest-rate risk
  for (const k of ['horizon', 'liquidity', 'wholesale', 'wall', 'large', 'rates', 'hedge', 'collateral', 'ladder', 'boe']) if (I[k].status !== 'ok') add('Treasurer', I[k].status === 'alarm' ? 'alarm' : 'warn', I[k].text);
  if (own('treasury') && P.treasury.hedgeTarget === 0 && loanSum('mortgage') > 3000 && rateSensitivity() < 0) add('Treasurer', 'warn', `The fixed-rate mortgage book is ${fmt(loanSum('mortgage'))} and nothing protects it. A rise in Bank Rate would squeeze the margin by about ${fmt(-rateSensitivity())} a year. Swaps would lock it in, at a small cost.`);
  if (own('treasury') && P.treasury.hedgeTarget >= 0.5 && P.treasury.hedgeTarget <= 1) add('Finance director', 'info', `The swaps cost about ${SWAP_SPREAD} points a year on the amount hedged and pay out only if rates rise. Is that insurance worth it?`);
  if (own('funding') && P.funding.boeTarget > 0) add('Treasurer', 'warn', `You have asked to keep ${fmt(P.funding.boeTarget)} drawn from the Bank of England. It is cheap to reach and expensive in confidence: the board and the Herald will notice.`);
  if (own('treasury') && P.treasury.longShare > 0.5) add('Treasurer', 'warn', `Most of our gilts are long. If Bank Rate rises they lose value, and you count them at market value.`);
  if (own('funding') && P.funding.wholesaleTarget > 0.2) add('Treasurer', 'warn', `${pc(P.funding.wholesaleTarget, 0)} of funding from other banks is cheap until markets freeze and nobody renews.`);
  if (pushback) add('Treasurer', 'info', `I would keep the cash. It is what carries us through a run: ${I.horizon.shown} of survival horizon at ${pc(lq, 0)} liquidity. Run it down and the finance director's extra yield disappears the first bad month.`);
  if (!notes.some(n => n.role === 'Treasurer')) add('Treasurer', 'info', `Funding looks sound: ${I.horizon.shown} survival horizon and liquidity at ${pc(lq, 0)}.`);

  // Head of operations: what reaches the counter and the inbox
  const waiting = counterQueue().length, mail = inboxActions().filter(c => !c.done).length;
  if (mail > 6) add('Head of operations', 'warn', `${mail} messages are waiting for a reply. Cases left to pile up turn into complaints and regulator letters.`);
  else add('Head of operations', 'info', `${waiting} at the counter and ${mail} message${mail === 1 ? '' : 's'} waiting.`);
  if (own('credit')) add('Head of operations', 'info', `Your credit rules decide most applications. Only the borderline ones reach the counter.`);
  if (own('operations')){
    const op = P.operations, m = S.ops && S.ops.m, defaultHeads = OPS_TEAMS.reduce((a, [t]) => a + OPS_DEFAULT[t], 0), heads = OPS_TEAMS.reduce((a, [t]) => a + op[staffKey(t)], 0), lab = Object.fromEntries(OPS_TEAMS);
    if (heads < defaultHeads - 1) add('Finance director', 'info', `Staffing is ${defaultHeads - heads} below the executive team's plan, saving about ${fmt((defaultHeads - heads) * STAFF_COST * 12)} a year. The head of operations disagrees.`);
    else if (heads > defaultHeads + 2) add('Finance director', 'warn', `Staffing is ${heads - defaultHeads} above the executive team's plan, which costs about ${fmt((heads - defaultHeads) * STAFF_COST * 12)} a year. Is the extra capacity being used?`);
    if (m){
      const [lt, lv] = Object.entries(m.load).reduce((a, [k, v]) => v > a[1] ? [k, v] : a, ['', -1]);
      if (lv > 1.05) add('Head of operations', lv > 1.25 ? 'alarm' : 'warn', `${lab[lt]} is at ${pc(lv, 0)} of capacity. Hiring takes three months, so decide now. Overtime helps for up to three months and then people burn out.`);
      if (m.age[Object.keys(m.age).reduce((a, k) => m.age[k] > m.age[a] ? k : a)] > 0.5) add('Head of operations', 'warn', `There is a backlog in ${lab[Object.keys(m.age).reduce((a, k) => m.age[k] > m.age[a] ? k : a)].toLowerCase()}. Cases left too long turn into upheld complaints, missed fraud and fines.`);
      if (op.fraudSensitivity > 0.7 && m.falseRate > 0.85) add('Head of operations', 'warn', `The fraud threshold is very sensitive: ${pc(m.falseRate, 0)} of alerts are genuine customers, who find their payments blocked. The chief risk officer will say it is worth it.`);
      if (op.fraudSensitivity < 0.25) add('Chief risk officer', 'warn', `The fraud threshold is lax. We missed about ${m.fraud.missed.toFixed(1)} fraud cases last month and refund every one.`);
      if (op.amlSensitivity < 0.25) add('Chief risk officer', 'warn', `The money-laundering threshold is lax. Laundering we miss comes back as a fine months later.`);
      if (m.meter > 1) add('Head of operations', 'warn', `We are running ${pc(m.meter, 0)} of the change our IT team can deliver. Each month at this level risks an outage, and projects slip.`);
    }
    const out = ['outsourceCards', 'outsourceContact', 'outsourceHosting'].filter(k => op[k] > 0).length;
    if (out && op.oversight < 2) add('Head of operations', 'warn', `We have outsourced ${out} service${out === 1 ? '' : 's'} with almost no oversight. The regulator still holds us responsible when a supplier fails.`);
  }
  if (quietLeft() > 0) add('Head of operations', 'info', `${quietLeft() - 1} quiet month${quietLeft() === 2 ? '' : 's'} left after this one: nothing outside the bank will go wrong while you learn the new settings.`);
  return notes;
}

// At the start of each month the team tells the player when an indicator moves into a worse band.
function warnMonth(){
  if (S.sim || !ceMode()) return;
  const was = S.ewi = S.ewi || {}, worse = [];
  for (const i of indicators()){
    if ((LEVEL[i.status] || 0) > (LEVEL[was[i.key]] || 0) && i.status !== 'ok') worse.push(i);
    was[i.key] = i.status;
  }
  worse.sort((a, b) => LEVEL[b.status] - LEVEL[a.status]);
  for (const i of worse.slice(0, 2)) addMail(i.role, (i.status === 'alarm' ? 'Warning: ' : 'Watch: ') + i.label, i.text + (i.status === 'alarm' ? ' This needs a decision now.' : ' Keep an eye on it.'), i.status === 'alarm' ? 'bad' : '', S.month, S.year);
}

/* ---- board confidence ----
   The chief executive answers to the board. Confidence (0 to 100) starts at 60 and moves a little every month:
   up when return on capital is ahead of peer banks and a dividend is paid steadily; down when it lags, when capital or
   liquidity is breached, when the regulator is unhappy, when the bank borrows from the Bank of England or takes a big loss,
   and while risk indicators sit in alarm. It drifts back toward 55 when nothing happens. Every third month there is a board
   meeting: the board tells the player where they stand. Confidence below 20 at two meetings in a row, or regulator
   enforcement action at a meeting, ends the job. Uses no random numbers, and only applies in the Chief Executive role. */
const BOARD_START = 60, BOARD_MID = 55, BOARD_SACK = 20;
// The board only watches once the player has actually taken over an area, so being offered one and leaving it alone is safe.
const boardActive = () => CE_AREAS.some(a => S.policy.owner[a] === 'player');
function boardOf(){
  if (!S.board) S.board = { conf: BOARD_START, hist: [], low: 0, q: { perf: 0, shock: 0, div: 0, warn: 0 }, divM: [], seen: { cb: S.stats.capBreach, em: S.stats.emergency, fi: S.stats.fines, dv: S.divPaid || 0 } };
  return S.board;
}
function boardBand(c){ return c >= 75 ? 'strong' : c >= 55 ? 'steady' : c >= 40 ? 'uneasy' : c >= BOARD_SACK ? 'losing patience' : 'ready to replace you'; }
function boardMonth(rep){
  if (S.sim || !boardActive() || (S.over && S.over !== 'done')) return;
  const B = boardOf(), r = rating(), k = Math.max(1, S.month), cr = capRatio(), lq = liqRatio();
  const gap = r.roe * 12 / k - r.peer, perf = clamp(gap * 25, -3, 2.5);
  const d = (cur, key) => { const x = Math.max(0, cur - B.seen[key]); B.seen[key] = cur; return x; };      // counters reset every year
  const breach = d(S.stats.capBreach, 'cb'), emerg = d(S.stats.emergency, 'em'), fined = d(S.stats.fines, 'fi'), paid = d(S.divPaid || 0, 'dv') > 0;
  let shock = -4 * breach - 4 * emerg - Math.min(3, fined / 50);
  if (lq < MIN_LIQ) shock -= 2;
  if (S.cb > 0.5) shock -= 1;       // borrowing from the Bank of England, for as long as it is out
  if (S.comp < 40) shock -= 2;
  if (rep && rep.profit < -0.03 * Math.max(1, capital())) shock -= 1.5;
  B.divM.push(paid ? 1 : 0); if (B.divM.length > 3) B.divM.shift();
  let div = B.divM.reduce((a, b) => a + b, 0) >= 2 ? 0.6 : 0;
  if (paid && cr < MIN_CAP) div = -1;
  const alarms = indicators().filter(i => i.status === 'alarm').length, warn = -Math.min(1.2, 0.4 * alarms);
  B.conf = clamp(B.conf + perf + shock + div + warn + (BOARD_MID - B.conf) * 0.04, 0, 100);
  B.q.perf += perf; B.q.shock += shock; B.q.div += div; B.q.warn += warn; B.gap = gap;
  if (S.month % 3 === 0) boardMeeting(r);
}
function boardMeeting(r){
  const B = boardOf(), conf = Math.round(B.conf), prev = B.hist.length ? B.hist[B.hist.length - 1].conf : BOARD_START, q = B.q;
  const reasons = [];
  if (q.perf > 1) reasons.push(`return on capital ahead of peer banks (${pc(r.roe * 12 / Math.max(1, S.month))} a year against ${pc(r.peer)})`);
  if (q.perf < -1) reasons.push(`return on capital behind peer banks (${pc(r.roe * 12 / Math.max(1, S.month))} a year against ${pc(r.peer)})`);
  if (q.shock < -1) reasons.push('breaches, regulator concern, Bank of England borrowing or a big loss');
  if (q.div > 0.5) reasons.push('a steady dividend');
  if (q.div < 0) reasons.push('a dividend paid while capital was below the minimum');
  if (q.warn < -0.5) reasons.push('risk indicators left in alarm');
  const quarter = S.month / 3, enforcement = regStatus()[1] === 'alarm';
  B.hist.push({ year: S.year, q: quarter, conf });
  B.low = conf < BOARD_SACK ? B.low + 1 : 0;
  B.q = { perf: 0, shock: 0, div: 0, warn: 0 };
  const change = conf - prev, dir = change >= 3 ? `up ${change}` : change <= -3 ? `down ${-change}` : 'little changed';
  let sack = '';
  if (B.low >= 2) sack = 'confidence';
  else if (enforcement) sack = 'enforcement';
  let body = `Board meeting, quarter ${quarter} of ${S.year}. The board's confidence in you is ${conf} out of 100 (${boardBand(conf)}), ${dir} on last quarter.${reasons.length ? ' The main reasons: ' + reasons.join('; ') + '.' : ''}`;
  if (sack === 'confidence') body += ' Confidence has been below 20 at two meetings in a row. The board has decided to replace you.';
  else if (sack === 'enforcement') body += ' The regulator has taken enforcement action against the bank. The board has decided that you cannot stay.';
  else if (B.low === 1) body += ' If confidence is still below 20 at the next meeting, you will be asked to leave.';
  else if (conf < 40) body += ' The board expects to see the numbers improve before the next meeting.';
  addMail('The board', sack ? 'The board has removed you' : `Board meeting: confidence ${conf} (${boardBand(conf)})`, body, sack || conf < 40 ? 'bad' : conf >= 70 ? 'good' : '', Math.max(0, S.month - 1), S.year);
  if (sack){
    S.over = 'sacked'; S.sackedWhy = sack;
    news(5, 'Counting House chief executive ousted', sack === 'enforcement' ? 'The board removed the chief executive after the regulator took enforcement action against the bank.' : 'The board has removed the chief executive after two quarters of falling confidence.');
  }
}
function resign(){
  if (!ceMode()) throw new Error('only a chief executive can resign');
  if (S.over) throw new Error('the game is already over');
  S.over = 'resigned'; S.debrief = makeDebrief();
  news(4, 'Counting House chief executive steps down', 'The chief executive has resigned. The board says it thanks them for their service.');
}

// The stress test: copy the bank, impose a severe recession from next month with a funding freeze and a market crash, and let the player's
// rules run it. Cards that need a decision take their first allowed option, as if the bank carried on as it is.
function simSched(){
  const abs = S.stressAbs, at = k => { const t = abs + k - S.year * 12; return t >= 0 && t <= 11 ? t : -1; };
  return { crash: at(3), pep: -1, prod: [], liq: [at(2), at(6)].filter(t => t >= 0), out: -1, sanc: [] };
}
function stressTest(overrides, months = 9, scenario = 'recession'){
  const real = S, realOut = OUT, realSink = LEDGER_SINK, start = { cap: capRatio(), liq: liqRatio(), horizon: survivalHorizon() };
  const r = { months, startCap: start.cap, lowCap: start.cap, lowCapMonth: 0, lowLiq: start.liq, lowLiqMonth: 0, lowHorizon: start.horizon, peakBoe: S.cb || 0, failed: false, why: '', capChange: 0 };
  try {
    S = JSON.parse(JSON.stringify(real)); OUT = null; LEDGER_SINK = null;      // nothing the copy does may reach the real ledger
    S.sim = true; S.stressAbs = S.year * 12 + S.month;
    S.stressY0 = { base: S.base, u: unemp(S.month), h: hpi(S.month), inf: inflation(S.month) };      // today's conditions, read before the path changes
    S.y0 = S.stressY0; S.simPath = scenario === 'rates' ? 'stressRates' : 'stress'; S.path = S.simPath;
    S.progress.quiet = null; S.sched = simSched();
    for (const [area, values] of Object.entries(overrides || {})){ Object.assign(S.policy[area], values); S.policy.owner[area] = 'player'; if (area === 'treasury') syncGilts(); }
    const cap0 = capital() + (S.divPaid || 0);
    for (let i = 1; i <= months; i++){
      for (let c; (c = S.queue.find(x => !x.done));){ const o = c.opts.find(optionAllowed) || c.opts[0]; resolveCard(c, o.k); }
      archiveMonth(); closeMonth();
      const cr = capRatio(), lq = liqRatio(), hz = survivalHorizon();
      if (cr < r.lowCap){ r.lowCap = cr; r.lowCapMonth = i; }
      if (lq < r.lowLiq){ r.lowLiq = lq; r.lowLiqMonth = i; }
      r.lowHorizon = Math.min(r.lowHorizon, hz); r.peakBoe = Math.max(r.peakBoe, S.cb || 0);
      r.endCap = cr; r.endLiq = lq; r.capChange = capital() - cap0; r.ran = i;
      if (S.over && S.over !== 'done'){ r.failed = true; r.why = S.over === 'capital' ? `capital fell to ${pc(cr)}, below the ${pc(FAIL_CAP, 0)} at which the regulator closes a bank` : S.over === 'licence' ? 'the regulator withdrew the licence' : 'the bank failed'; break; }
      if (S.over === 'done') nextYear();
    }
  } finally { S = real; OUT = realOut; LEDGER_SINK = realSink; }
  r.lowBelowMin = r.lowCap < MIN_CAP; r.liqBelowMin = r.lowLiq < MIN_LIQ;
  for (const k of ['startCap', 'lowCap', 'lowLiq', 'endCap', 'endLiq', 'capChange']) if (typeof r[k] === 'number') r[k] = Math.round(r[k] * 1e5) / 1e5;
  return r;
}
function runStress(overrides, scenario = 'recession'){
  if (scenario !== 'recession' && scenario !== 'rates') throw new Error('unknown stress scenario');
  if (!ceMode()) throw new Error('the stress test is part of the Chief Executive role');
  if (S.over) throw new Error('the stress test needs a month to start from: begin the new year first');
  const ov = {};
  if (overrides){
    if (typeof overrides !== 'object' || Array.isArray(overrides)) throw new Error('bad overrides');
    for (const [area, values] of Object.entries(overrides)){
      const lim = POLICY_LIMITS[area];
      if (!lim || !S.progress.unlocked.includes(area)) throw new Error(area + ' policy is not unlocked');
      if (!values || typeof values !== 'object') throw new Error('no values');
      for (const [k, v] of Object.entries(values)) if (!lim[k] || typeof v !== 'number' || !isFinite(v) || v < lim[k][0] || v > lim[k][1]) throw new Error('bad value for ' + k);
      ov[area] = values;
    }
  }
  S.stress = { month: S.month, year: S.year, scenario, custom: Object.keys(ov).length > 0, ...stressTest(ov, 9, scenario) };
  return S.stress;
}

function rating(){
  const profit = capital() - S.startCap + (S.divPaid || 0) - (S.injected || 0), roe = profit / (S.startCap + (S.injected || 0) / 2);
  if (S.over && S.over !== 'done' && S.over !== 'resigned') return { letter:'D', score:0, profit, roe, peer:0 };      // resigning is judged on the year so far
  const avgBase = S.rateSum ? S.rateSum / Math.max(1, S.month) : S.base;
  const peer = clamp(-0.43 + 0.112 * avgBase + (S.career && S.career.length ? 0.07 : 0), -0.25, 0.3);
  const pP = clamp(0.5 + (roe - peer) / 0.15, -1, 1.5) * 30, pC = S.trust * 0.35, pK = S.comp * 0.25;
  const pen = S.stats.capBreach * 4 + S.stats.emergency * 4;
  const pD = S.divPaid > 0 ? clamp(S.divPaid / S.startCap / 0.05, 0, 1) * 8 : 0;   // shareholders like a dividend, up to 8 points at a 5% yield
  const score = pP + pC + pK - pen + pD;
  const letter = score >= 82 ? 'AAA' : score >= 74 ? 'AA' : score >= 66 ? 'A' : score >= 58 ? 'BBB' : score >= 50 ? 'BB' : score >= 42 ? 'B' : score >= 32 ? 'CCC' : 'CC';
  return { letter, score, profit, roe, pP, pC, pK, pen, pD, peer };
}

/* ---- inbox: mail is game state, created by the engine ---- */
const FROM = { fraud:'Fraud operations', aml:'Financial crime team', sanctions:'Sanctions screening', card:'Cards team', rate:'Bank of England', treasury:'Your treasurer', liqshock:'Your treasurer', funding:'Your treasurer', outage:'Operations', complaint:'Complaints team', capital:'Finance director', wmLaunch:'The board', wmHouse:'Wealth product team', wmMarket:'Wealth desk', wmCampaign:'Wealth team' };
const fv = (c, l) => { const f = c.fields.find(x => x.l === l); return f ? f.v : ''; };
const firstSentence = t => { const m = String(t).match(/^(.{12,}?[.:!?])(\s|$)/); const x = m ? m[1].replace(/[.:]$/, '') : String(t); return x.length > 90 ? x.slice(0, 87) + '…' : x; };
function fromOf(c){ return FROM[c.kind] || c.who.name; }
function subjOf(c){
  switch (c.kind){
    case 'fraud': return `Card payment held: ${fv(c, 'Amount')} at ${fv(c, 'Merchant')}`;
    case 'aml': return `Unusual activity on ${c.who.name}'s account`;
    case 'sanctions': return `Screening hit on a payment by ${c.who.name}`;
    case 'card': return `Credit limit request from ${c.who.name}`;
    case 'rate': return `Bank Rate: ${fv(c, 'Bank Rate')}`;
    case 'treasury': return 'Where should our spare cash sit?';
    case 'liqshock': return `Deposits leaving: ${fv(c, 'Outflow')}`;
    case 'funding': return `Liquidity down to ${fv(c, 'Liquidity')}`;
    case 'outage': return 'Card payments went down on Saturday';
    case 'complaint': return `Formal complaint from ${c.who.name}`;
    case 'capital': return `Capital ratio is ${fv(c, 'Capital ratio')}`;
    case 'wmLaunch': return 'Should we start managing money for customers?';
    case 'wmHouse': return 'Proposal: our own investment fund';
    case 'wmMarket': return 'Shares have fallen and clients are calling';
    case 'wmCampaign': return 'Proposal: pitch portfolios to our savers';
    default: return firstSentence(c.note);
  }
}
function senderOf(t){
  if (/Regulator|OFSI|Ombudsman|National Crime|regulator|fair-value|tipped/.test(t)) return 'Compliance';
  if (/Shares|wealth|portfolio|Harwood|client/i.test(t)) return 'Wealth desk';
  if (/Deposits|Bank of England|Liquidity|cash|withdrawn/.test(t)) return 'Your treasurer';
  if (/behind|written off|payment plan|recovery|full payments|Written off/.test(t)) return 'Credit risk';
  if (/mule|fraud|declined|applicant/.test(t)) return 'Fraud operations';
  return 'Operations';
}
const dayOf = id => (id * 7) % 27 + 1;
function addMail(from, subject, body, tone, m, y){ S.inbox = S.inbox || []; S.mailId = (S.mailId || 0) + 1; S.inbox.push({ id:S.mailId, from, subject, body, tone: tone || '', when:`${dayOf(S.mailId)} ${MONTHS[m].slice(0, 3)} ${y}`, read:false }); if (S.inbox.length > 60) S.inbox.splice(0, S.inbox.length - 60); }
function archiveMonth(){
  for (const c of inboxActions()) if (c.done){
    const o = c.opts.find(x => x.k === c.done);
    S.inbox = S.inbox || []; S.mailId = (S.mailId || 0) + 1;
    S.inbox.push({ id:S.mailId, from: fromOf(c), subject: subjOf(c), body: c.note, tone:'', when:`${dayOf(c.id)} ${MONTHS[S.month].slice(0, 3)} ${S.year}`, read:true, reply:{ label: o ? o.l : 'Done', lines:(c.out ? c.out.lines : []).map(l => l.t) } });
  }
}
function mailMonth(rep, prevMonth, prevYear){
  for (const e of rep.events) addMail(senderOf(e.t), firstSentence(e.t), e.t, e.tone, prevMonth, prevYear);
  if (rep.next) addMail('Economics desk', `${MONTHS[S.month]} outlook`, `Unemployment ${rep.next.unemp.toFixed(1)}%. House prices ${(rep.next.hpi * 100 >= 0 ? '+' : '')}${(rep.next.hpi * 100).toFixed(1)}% this year. Bank Rate ${rep.next.base.toFixed(2)}%. Inflation ${inflation().toFixed(1)}%, so savings at the best easy-access rate return ${(mkt() - inflation() >= 0 ? '+' : '')}${(mkt() - inflation()).toFixed(1)}% a year after rising prices. Shares ${(S.mkt / S.mktY0 - 1 >= 0 ? '+' : '')}${pc(S.mkt / S.mktY0 - 1)} this year.`, '', prevMonth, prevYear);
}
function welcomeMail(){
  if ((S.inbox || []).length || S.month !== 0 || S.over) return;
  if (S.scenario){ const sc = SCENARIOS[S.scenario]; addMail('The board', `Briefing: ${sc.name}`, `${sc.blurb} You have one year. Your goals: ${sc.goals.map(g => g.label.toLowerCase()).join('; ')}. Tap Goals at the top to check progress.`, '', 0, S.year); }
  else if (S.tutorial) addMail('Your trainer', 'Training day', 'Welcome to your first day. Each customer at the counter and each message today comes with a yellow note from me explaining what to look for. Decide for yourself, then see what happens. From February you are on your own. The Branch tab lets you spend money on staff and systems; Books shows the balance sheet.', '', 0, S.year);
  else addMail('The board', 'Welcome to Counting House', 'You are the new manager. Customers come to your counter; everything else lands here. Reply to anything marked Response required, serve the queue, then press Continue to close the month. The Branch tab lets you invest in staff and systems. The board judges you on profit against peer banks, on how customers are treated and on your standing with the regulator.', '', 0, S.year);
}
function markRead(key){ const id = +key.slice(1); const it = key[0] === 'c' ? S.queue.find(x => x.id === id) : (S.inbox || []).find(x => x.id === id); if (it) it.read = true; }

/* ---- command interface: the only way the outside world changes the game ----
   A game is fully defined by its seed, engine version and the ordered list of commands. */
function dispatch(cmd){
  const out = dispatchInner(cmd);
  if (LEDGER_STRICT && S && S.ledger){ const bad = ledgerCheck(); if (bad.length) throw new Error('ledger check failed after ' + cmd.type + ': ' + bad.join('; ')); }
  return out;
}
function dispatchInner(cmd){
  switch (cmd.type){
    case 'newGame': return newGame(cmd.seed, cmd.opts || {});
    case 'resolve': { const c = S.queue.find(x => x.id === cmd.id); return resolveCard(c, cmd.k); }
    case 'closeMonth': { const pm = S.month, py = S.year; archiveMonth(); const rep = closeMonth(); mailMonth(rep, pm, py); return rep; }
    case 'read': return markRead(cmd.key);
    case 'nextYear': return nextYear();
    case 'buy': return buyUpgrade(cmd.key);
    case 'setPolicy': return setPolicy(cmd.area, cmd.values, cmd.release);
    case 'stress': return runStress(cmd.overrides, cmd.scenario || 'recession');
    case 'resign': return resign();
    default: throw new Error('unknown command ' + cmd.type);
  }
}
