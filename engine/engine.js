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
};
const KNAME = { mortgage:'mortgage', personal:'personal loan', card:'credit card', business:'business loan' };
const AMORT = { mortgage:0.003, personal:0.025, card:0.02, business:0.012 };
const FIRST = ['Ama','Tom','Priya','Callum','Mei','Joseph','Fatima','Ollie','Grace','Kwame','Sinead','Ravi','Ewa','Dylan','Hannah','Yusuf','Chloe','Mateusz','Aisha','George','Niamh','Arjun','Bethany','Leon','Sofia','Imran','Rosa','Theo','Zainab','Harry','Maya','Femi','Ellie','Kofi','Jade','Tomasz','Lucy','Omar','Ruth','Danny','Marcus','Ifeoma','Gareth','Lena'];
const LAST = ['Mensah','Hughes','Patel','Reid','Chen','Okafor','Khan','Walsh','Taylor','Boateng','Murphy','Shah','Nowak','Evans','Clarke','Ahmed','Wright','Kowalski','Hussain','Brooks','Byrne','Singh','Lloyd','Campbell','Rossi','Begum','Price','Owusu','Fraser','Adeyemi','Doyle','Lewandowski'];

function P(){ return S.path === 'sc' ? SCENARIOS[S.scenario].path : PATHS[S.path]; }
function ease(t){ t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
function unemp(m = S.month){ const p = P(); if (p.uArr) return clamp(S.y0.u + p.uArr[Math.min(11, m)], 3.4, 9.5); return clamp(S.y0.u + (p.u[1] - p.u[0]) * ease(m / 11), 3.6, 8.5); }
function hpi(m = S.month){ const p = P(); if (p.hArr) return S.y0.h * (1 + p.hArr[Math.min(11, m)] / 100); return S.y0.h * (1 + (p.h[0] + (p.h[1] - p.h[0]) * clamp(m / 11, 0, 1)) / 100); }
const INFL = { soft:2.0, sticky:4.6, downturn:1.4, recovery:2.3 };
function inflation(m = S.month){ const p = P(); if (p.infArr) return p.infArr[Math.min(11, m)]; const y0 = S.y0.inf != null ? S.y0.inf : 2.8; return y0 + ((INFL[S.path] != null ? INFL[S.path] : 2.5) - y0) * ease(m / 11); }
function hpiYr(m = S.month){ return hpi(m) / S.y0.h - 1; }
function rateAt(m){ if (P().abs) return P().rate[m]; let d = P().rate[m] - 4; if ((d < 0 && S.y0.base < 2.5) || (d > 0 && S.y0.base > 5.5)) d /= 2; return clamp(Math.round((S.y0.base + d) * 4) / 4, 0.25, 6.5); }
function collateral(l){ return l.prop * hpi() / (l.hpi0 || 1); }
function uf(){ return Math.pow(unemp() / 4.3, 1.8); }
function mkt(){ return Math.max(0.25, S.base - 1.5); }

/* balance sheet */
function giltBook(){ return S.gilts.reduce((a, g) => a + g.amt, 0); }
function giltYield(kind){ return S.base + (kind === 'long' ? 0.65 : 0.15); }
function giltMV(){ return S.gilts.reduce((a, g) => a + g.amt * (1 - g.dur * (giltYield(g.kind) - g.y0) / 100), 0); }
function loanSum(kind){ return S.loans.reduce((a, l) => a + ((!kind || l.kind === kind || (kind === 'retail' && (l.kind === 'personal' || l.kind === 'card'))) ? l.bal : 0), 0); }
function assets(){ return S.cash + giltBook() + S.legacy + loanSum(); }
function capital(){ return assets() - S.deposits - S.cb; }
function rwa(){ let r = S.legacy * 0.75 + 1000 + aum() * 0.005; for (const l of S.loans) r += l.bal * (l.kind === 'mortgage' ? (l.ltv > 80 ? 0.5 : 0.35) : 1); return r; }
function capRatio(){ return capital() / rwa(); }
function liqRatio(){ return (S.cash + giltMV()) / S.deposits; }
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
const LEDGER_DIR = { cash:1, legacy:1, deposits:-1, cb:-1 };   // accounts mirrored by a plain state field
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
  const a = [['cash', S.cash], ['gilts', giltBook()], ['legacy', S.legacy], ['loans', loanSum()], ['deposits', -S.deposits], ['cb', -S.cb]];
  je(memo || 'opening', a.concat([['equity.opening', -a.reduce((t, l) => t + l[1], 0)]]), { ledgerOnly:true });
}
// Compares the ledger with the live state; returns a list of problems (empty when everything agrees).
function ledgerCheck(){
  const L = S.ledger, bad = [], near = (x, y) => Math.abs(x - y) <= 1e-6 + 1e-9 * Math.abs(y);
  const chk = (n, ledger, live) => { if (!near(ledger, live)) bad.push(`${n}: ledger ${ledger} vs state ${live}`); };
  chk('cash', L.bal.cash || 0, S.cash); chk('legacy', L.bal.legacy || 0, S.legacy); chk('deposits', -(L.bal.deposits || 0), S.deposits); chk('cb', -(L.bal.cb || 0), S.cb);
  chk('gilts', L.bal.gilts || 0, giltBook()); chk('loans', L.bal.loans || 0, loanSum());
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
  je('loan.originate', [['loans', l.bal], ['cash', -l.bal]]); S.loans.push(l); S.stats.loans++; S.stats.lent += l.bal;
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
    owner: { pricing: 'system', credit: 'system' } };
}
const POLICY_LIMITS = {
  pricing: { mortgageSpread: [0, 6], mortgagePremium: [0, 3], personalLow: [0, 40], personalHigh: [0, 40], cardRate: [0, 40] },
  credit: { mortgageMaxLtv: [50, 100], mortgageMaxLti: [2, 8], mortgageMaxAff: [0.2, 0.8], mortgageMinScore: [300, 900], personalMinScore: [300, 900], personalMaxDebtRatio: [0.2, 2] } };
// Prices above the system's lose customers and attract riskier ones; at or below the system's nothing changes.
// excess() is how many points a price is above the system price; dem() is the share of customers who still say yes;
// adv() scales default risk for the customers who do. No random draw happens at the system prices.
const excess = name => Math.max(0, S.policy.pricing[name] - systemPolicy().pricing[name]);
const dem = (ex, slope = 0.35) => ex <= 0 ? 1 : clamp(1 - slope * ex, 0.05, 1);
const adv = ex => 1 + 0.08 * ex;
const takeUp = (ex, slope) => ex <= 0 || chance(dem(ex, slope));
const MORTGAGE_SLOPE = 1.2;   // mortgage customers shop around hard: 0.5 points dearer loses about 40% of them
/* ---- unlocks: a strong year (rating A or better) hands over the next area, with a briefing letter from the board ---- */
const UNLOCK_ORDER = ['pricing', 'credit'];
const STRONG = ['AAA', 'AA', 'A'];
const BRIEFING = {
  pricing: ['Pricing is yours', 'The board was impressed by your year. From now on you set the prices: the mortgage spread over Bank Rate, the personal loan rates and the card rate. Until today the executive team set them. Price too high and customers go elsewhere, and the ones who stay are riskier. Price too low and you give away margin. Open Policy from the menu to change them, or return to the executive team\'s prices at any time.'],
  credit: ['Credit policy is yours', 'Another strong year. You now set the credit policy: how much of a home\'s price we lend, how many times income, how much of take-home pay a mortgage may take, and the lowest credit scores we accept. Loosening it wins customers and brings losses a year or two later.'] };
function grantUnlock(r){
  if (!STRONG.includes(r.letter)) return;
  const next = UNLOCK_ORDER.find(a => !S.progress.unlocked.includes(a));
  if (!next) return;
  S.progress.unlocked.push(next);
  addMail('The board', BRIEFING[next][0], BRIEFING[next][1], 'good', 0, S.year);
}
function setPolicy(area, values, release){
  const lim = POLICY_LIMITS[area];
  if (!lim) throw new Error('unknown policy area ' + area);
  if (!S.progress.unlocked.includes(area)) throw new Error(area + ' policy is not unlocked');
  if (release){ S.policy[area] = systemPolicy()[area]; S.policy.owner[area] = 'system'; return S.policy[area]; }   // hand the area back to the executive team
  if (!values || typeof values !== 'object') throw new Error('no values');
  for (const [k, v] of Object.entries(values)){
    if (!lim[k]) throw new Error('unknown setting ' + k);
    if (typeof v !== 'number' || !isFinite(v) || v < lim[k][0] || v > lim[k][1]) throw new Error(k + ' must be between ' + lim[k][0] + ' and ' + lim[k][1]);
  }
  Object.assign(S.policy[area], values); S.policy.owner[area] = 'player';
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
  const doBook = (loan, extra = 0) => { const m = mortgageRisk(h, loan); { const pay = annuity(loan, m.rate + extra, h.term); custSay(`${full(pay)} a month at ${(m.rate + extra).toFixed(2)}%, ${pc(pay / takeHome(h.inc), 0)} of take-home pay. Over ${h.term} years they repay ${full(pay * h.term * 12)} for a ${full(loan)} loan, if the rate stayed the same.`); } book({ kind:'mortgage', name:h.name, bal:loan, rate:m.rate + extra, pd: Math.min(0.95, m.pd * (extra ? 1.25 : 1) * adv(spreadEx)), prop:h.price, ltv:m.ltv }); money('fees', 0.999 - (h.broker ? loan * 0.0035 : 0), h.broker ? 'Fee less broker' : 'Fee'); };
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
  if (k === 'low'){ if (takeUp(excess('personalLow'))){ cv(pr.personalLow); book({ kind:'personal', name:h.name, bal:h.amt, rate:pr.personalLow, pd:h.pd * adv(excess('personalLow')) }); say(`Money in ${nm}'s account within the hour.`); dT(h.pd < 0.08 ? 1 : 0); } else say(`${nm} took a cheaper loan from a lender down the road.`); }
  if (k === 'high'){ if (chance(clamp(0.25 + h.pd * 4, 0.25, 0.92) * dem(excess('personalHigh')))) { cv(pr.personalHigh); book({ kind:'personal', name:h.name, bal:h.amt, rate:pr.personalHigh, pd: Math.min(0.95, h.pd * 1.3 * adv(excess('personalHigh'))) }); say(`${nm} signs at ${pr.personalHigh}%.${h.pd > 0.08 ? ' Nobody else would lend to them.' : ''}`); if (h.pd < 0.06) dT(-1); } else say(`${nm} took ${pr.personalLow}% from a lender down the road.`); }
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
    const cex = excess('cardRate'); book({ kind:'card', name:h.name, bal, rate:S.policy.pricing.cardRate, pd: (h.persist ? 0.32 : 0.025) * adv(cex) });
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

function sellGilts(){ const mv = giltMV(), bk = giltBook(); je('gilts.sell', [['cash', mv], ['gilts', -bk], ['pl.gilts', bk - mv]]); S.gilts = []; if (mv - bk < -0.5) S.stats.giltLoss = (S.stats.giltLoss || 0) + 1; return mv - bk; }
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
function mktMean(m){ if (P().mktArr) return P().mktArr[m]; return S.path === 'downturn' ? (m < 6 ? -2.2 : 1.0) : ({ soft:0.7, sticky:-0.4, recovery:1.3 })[S.path]; }
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
res.capital = (c, k) => {
  if (k === 'raise'){ news(5, `Counting House asks shareholders for ${fmt(300)}`, 'The bank says it needs more capital to keep lending.'); je('equity.issue', [['cash', 300], ['equity.paidin', -300]]); S.injected = (S.injected || 0) + 300; chip('Capital +' + fmt(300), 'good'); say('Shareholders put in more money. Your profit is now shared across more shares, so each one earns less.'); }
  if (k === 'sell'){ const ms = S.loans.filter(l => l.kind === 'mortgage' && l.status === 'current').sort((a, b) => b.bal - a.bal); let sold = 0, target = ms.reduce((a, l) => a + l.bal, 0) / 2;
    for (const l of ms){ if (sold >= target) break; sold += l.bal; je('loan.sell', [['cash', l.bal * 0.97], ['pl.gilts', l.bal * 0.03], ['loans', -l.bal]]); S.loans = S.loans.filter(x => x !== l); }
    chip('Mortgages sold ' + fmt(sold), 'neutral'); chip('Loss on sale ' + fmt(-sold * 0.03), 'bad'); say(`Another bank buys ${full(sold)} of mortgages. Less risk on your books, less interest coming in.`); }
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
  S = { v:2, rs:seed, seed, month:0, year:2027, path:'soft', cash:5000, gilts:[{ kind:'short', amt:1800, coupon:4.1, dur:1.9, y0:4.15 }], deposits:15650,
    legacy:10000, legacyRate:6.0, loans:[], savRate:2.5, cb:0, base:4.0, startCap:0,
    trust:60, comp:80, flags:{}, queue:[], qi:0, pending:[], pl:blankPL(), last:null, history:[], over:null, nextId:1,
    lastTreasury:-9, prodOrder:[], prodUsed:[], sched:{}, y0:{ base:4, u:4.3, h:1 }, career:[], divPaid:0, wm:null, wmOffer:2, mkt:100, mktY0:100, mktHist:[100], lastMkt:0,
    stats: freshStats(), up:{}, news:[], tutorial: !!opts.tutorial, scenario: opts.scenario || null,
    engine:ENGINE_VERSION, progress:{ unlocked:['branch'] }, policy:systemPolicy(), ledger:{ bal:{}, n:0 } };
  S.path = pick(['soft', 'sticky', 'downturn']);
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
  S.y0 = { base:S.base, u:unemp(11), h:hpi(11), inf:inflation(11) };
  for (const l of S.loans){ l.m0 -= 12; if (l.since != null) l.since -= 12; if (!l.hpi0) l.hpi0 = 1; }
  for (const p of S.pending) p.due -= 12;
  S.lastTreasury -= 12;
  if (typeof S.flags.od === 'number') S.flags.od -= 12;
  S.year++; S.month = 0; S.over = null; S.history = []; S.divPaid = 0; S.injected = 0; S.rateSum = 0; if (S.lastCapCard != null) S.lastCapCard -= 12; S.mktY0 = S.mkt;
  S.wmOffer = S.wm ? -1 : 1; S.news = [];
  if (S.wm){ for (const k of ['houseAt','campAt','calm','cashUntil']) S.wm[k] -= 12; }
  const b = S.y0.base, u = S.y0.u;
  S.path = wpick([['soft', b > 4.5 ? 3 : 2], ['sticky', b < 3 ? 3 : b > 5 ? 0.3 : 1.8], ['downturn', u > 6.5 ? 0.3 : b > 5 ? 2.5 : 1.4], ['recovery', u > 5 ? 4 : 0.4]]);
  if (!S.prodOrder.includes('broker')) S.prodOrder = S.prodOrder.concat(shuffle(['broker','ggs']));
  S.startCap = capital();
  S.stats = freshStats(); S.stats.minCap = capRatio();
  S.sched = makeSched();
  grantUnlock(r);
  buildMonth();
}
function migrate(s){ if (!s.policy) s.policy = systemPolicy(); if (!s.up) s.up = {}; if (!s.news) s.news = []; if (!s.stats.harsh) s.stats.harsh = 0; if (s.queue && s.qi){ s.queue.forEach((c, i) => { if (i < s.qi && !c.done) c.done = 'x'; }); } if (!s.inbox) s.inbox = []; if (s.mkt == null){ s.wm = null; s.wmOffer = s.month <= 2 ? 2 : -1; s.mkt = 100; s.mktY0 = 100; s.mktHist = [100]; s.lastMkt = 0; } if (s.pl && s.pl.wealth == null) s.pl.wealth = 0; if (s.sched && s.sched.crash == null){ s.sched.crash = -1; s.sched.pep = 6; } if (!s.y0) s.y0 = { base:4, u:4.3, h:1 }; if (!s.career) s.career = []; if (s.divPaid == null) s.divPaid = 0; if (!s.progress) s.progress = { unlocked:['branch'] }; if (!s.engine) s.engine = ENGINE_VERSION; const keep = S; S = s; try { if (!s.ledger) openLedger('opening (migrated)'); welcomeMail(); } finally { S = keep; } return s; }
function buildMonth(){ buildMonthCards(); deskByPolicy(); }
function buildMonthCards(){
  const m = S.month, lead = [], other = [];
  S.pl = blankPL();
  const nr = rateAt(m);
  if (nr !== S.base){ const old = S.base; S.base = nr; lead.push(gen.rate(old, nr)); }
  for (const l of S.loans.filter(l => l.status === 'arrears' && !l.carded).slice(0, 2)) { l.carded = true; lead.push(gen.hardship(l)); }
  if (S.sched.prod.includes(m)) { const c = gen.product(); if (c) other.push(c); }
  if (S.sched.liq.includes(m)) other.push(gen.liqshock());
  if (!S.wm && S.wmOffer === m) other.push(gen.wmLaunch());
  if (S.wm){ if (S.lastMkt < -0.05) lead.push(gen.wmMarket()); if (S.wm.houseAt === m) other.push(gen.wmHouse()); if (S.wm.campAt === m) other.push(gen.wmCampaign()); if (S.sched.pep === m) other.push(gen.wmPep()); }
  if (S.sched.out === m) other.push(gen.outage());
  if (S.sched.sanc.includes(m)) other.push(gen.sanctions());
  if (capRatio() < 0.125 && m - (S.lastCapCard ?? -9) >= 2) lead.push(gen.capital());
  if (liqRatio() < 0.16) other.push(gen.funding());
  else if (S.cash - 0.2 * S.deposits > 1000 && m - S.lastTreasury >= 3) other.push(gen.treasury());
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
function current(){ return S.queue.find(c => !c.done) || null; }
function optionAllowed(o){ return !(o.cash && S.cash < o.cash); }
function counterQueue(){ return S.queue.filter(c => c.phys && !c.done); }
function inboxActions(){ return S.queue.filter(c => !c.phys); }
function remaining(){ return S.queue.filter(c => !c.done).length; }
function resolveCard(c, k){
  if (!c || c.done) return null;
  begin(); res[c.kind](c, k); c.done = k;
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
  post('intRes', Math.max(0, S.cash) * S.base / 1200);
  post('intDep', -S.deposits * S.savRate * 0.6 / 1200);
  if (S.cb > 0) post('intCB', -S.cb * (S.base + 1) / 1200);
  if (upMonthly()) post('costs', -upMonthly());
  post('costs', -(38 - (S.flags.branch === 'closed' ? 10 : S.flags.branch === 'hub' ? 6 : 0)) * Math.pow(Math.max(1, assets() / 16800), 0.5));
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
  // funding plumbing
  if (S.cash < 0){ const need = -S.cash + S.deposits * 0.05; je('boe.draw', [['cash', need], ['cb', -need]]); S.trust = clamp(S.trust - 3, 0, 100); S.stats.emergency++; news(9, 'Counting House forced into emergency borrowing', 'The bank ran out of cash and turned to the Bank of England.'); ev(`You ran out of cash. Emergency borrowing from the Bank of England: ${fmt(need)}.`, 'bad'); }
  else if (S.cb > 0 && liqRatio() > 0.2){ const rpy = Math.min(S.cb, S.cash - 0.15 * S.deposits); if (rpy > 0){ je('boe.repay', [['cb', rpy], ['cash', -rpy]]); ev(`Repaid ${fmt(rpy)} to the Bank of England.`, 'good'); } }
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
  evalGoals(S.history[S.history.length - 1], !!S.over);
  if (!S.over) buildMonth();
  rep.next = S.over ? null : { unemp: unemp(), hpi: hpiYr(), base: S.base };
  return rep;
}

function rating(){
  const profit = capital() - S.startCap + (S.divPaid || 0) - (S.injected || 0), roe = profit / (S.startCap + (S.injected || 0) / 2);
  if (S.over && S.over !== 'done') return { letter:'D', score:0, profit, roe, peer:0 };
  const avgBase = S.rateSum ? S.rateSum / Math.max(1, S.month) : S.base;
  const peer = clamp(-0.43 + 0.112 * avgBase + (S.career && S.career.length ? 0.07 : 0), -0.25, 0.3);
  const pP = clamp(0.5 + (roe - peer) / 0.15, -1, 1.5) * 30, pC = S.trust * 0.35, pK = S.comp * 0.25;
  const pen = S.stats.capBreach * 4 + S.stats.emergency * 4;
  const score = pP + pC + pK - pen;
  const letter = score >= 82 ? 'AAA' : score >= 74 ? 'AA' : score >= 66 ? 'A' : score >= 58 ? 'BBB' : score >= 50 ? 'BB' : score >= 42 ? 'B' : score >= 32 ? 'CCC' : 'CC';
  return { letter, score, profit, roe, pP, pC, pK, pen, peer };
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
    default: throw new Error('unknown command ' + cmd.type);
  }
}
