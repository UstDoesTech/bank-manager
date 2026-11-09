/* ---------- Scenarios ---------- */
function goalsHTML(){ return (S.goals || []).map(g => `<div class="goal ${g.ok === true ? 'ok' : g.ok === false ? 'no' : 'wait'}"><i>${g.ok === true ? '✓' : g.ok === false ? '✗' : '•'}</i><span>${esc(g.label)}</span></div>`).join(''); }
function scenarioPicker(){
  overlay(`<div class="eyebrow">Scenario mode</div><h2>Pick a crisis</h2>
    <p style="color:var(--muted);font-size:14px">One year, set goals. Each is modelled on a real period in banking history.</p>
    ${Object.entries(SCENARIOS).map(([k, sc]) => `<div class="scen"><span class="era">${esc(sc.era)} · ${sc.year}</span><h3>${esc(sc.name)}</h3><p style="margin:0;font-size:14px">${esc(sc.blurb)}</p><ul>${sc.goals.map(g => `<li>${esc(g.label)}</li>`).join('')}</ul><button type="button" class="btn primary" data-sc="${k}">Play ${esc(sc.name.replace(/^The /, 'the '))}</button></div>`).join('')}
    <button type="button" class="btn neutral" id="ovGo">Back</button>`);
  $('#ovGo').onclick = titleScreen;
  $('#ov .panel').onclick = e => { const b = e.target.closest('[data-sc]'); if (b) startScenario(b.dataset.sc); };
}
function startScenario(k){ startGame({ scenario:k }); }

function endScreen(){
  const r = rating(), st = S.stats;
  const fail = endingText();
  if (!S.scenario) try { const best = JSON.parse(localStorage.getItem('ch-best') || 'null'); if (!best || r.score > best.score) localStorage.setItem('ch-best', JSON.stringify({ score:r.score, letter:r.letter, level:S.diff || 'standard' })); } catch (e) {}
  const sc = S.scenario ? SCENARIOS[S.scenario] : null, met = (S.goals || []).filter(g => g.ok).length;
  overlay(`<div class="eyebrow">${sc ? `${esc(sc.name)} · ${sc.year}` : `${S.year} · year-end rating${S.career.length ? ` · year ${S.career.length + 1}` : ''}${S.diff ? ` · ${DIFFICULTY[S.diff].name}` : ''}`}</div>
    ${sc ? `<h2>${met === S.goals.length ? 'Scenario complete' : `${met} of ${S.goals.length} goals met`}</h2><div style="display:grid;gap:6px">${goalsHTML()}</div><h3>Rating</h3>` : ''}
    <div class="rating">${r.letter}</div>
    <p>${fail ? esc(fail) : sc ? 'Profit is judged against what similar banks made in the same conditions.' : `The economy this year: ${P().name}.`}</p>
    <div class="grid2">
      <div class="stat"><span>Profit</span><b style="color:${r.profit >= 0 ? 'var(--good)' : 'var(--bad)'}">${fmt(r.profit, true)}</b></div>
      <div class="stat"><span>${termBtn('Return on capital', 'Return on capital')}</span><b>${pc(r.roe)}</b><span style="text-transform:none;letter-spacing:0">Peer banks ${r.peer >= 0 ? '+' : ''}${pc(r.peer, 0)}</span></div>
      <div class="stat"><span>Customer trust</span><b>${Math.round(S.trust)}/100</b></div>
      <div class="stat"><span>Regulator</span><b>${regStatus()[0]}</b></div>
    </div>
    ${S.board ? `<p style="color:var(--muted);font-size:14px">The board's confidence in you: ${Math.round(S.board.conf)} (${esc(boardBand(S.board.conf))}).</p>` : ''}
    ${ambitionsYearEnd()}
    <details class="more"><summary>The year in numbers</summary>
    <table class="ledger">
      <tr><td>Accounts opened</td><td>${st.customers}</td></tr>
      <tr><td>Loans made</td><td>${st.loans} · ${fmt(st.lent)}</td></tr>
      <tr><td>Loans written off</td><td>${st.defaults} · ${fmt(st.losses)}</td></tr>
      <tr><td>Card fraud stopped / missed</td><td>${st.fraudStop} / ${st.fraudMiss}</td></tr>
      <tr><td>Scams stopped / missed</td><td>${st.scamStop} / ${st.scamMiss}</td></tr>
      <tr><td>Suspicious activity reports</td><td>${st.sars}</td></tr>
      <tr><td>Fines, penalties and redress</td><td>${fmt(st.fines)}</td></tr>
      ${S.wm ? `<tr><td>Client assets managed</td><td>${fmt(aum())}</td></tr>` : ''}
      <tr><td>Lowest capital ratio</td><td>${pc(st.minCap)}</td></tr>
    </table>
    <p style="color:var(--muted);font-size:13px">Default rates in this game run at about three times real-world levels, and a year is squeezed into twelve short months, so things move faster and go wrong more often than they would in life.</p>
    ${S.career.length ? `<h3>Earlier years</h3><table class="ledger">${S.career.map(c => `<tr><td>${c.year} · ${esc(c.letter)}</td><td>${fmt(c.profit, true)}</td></tr>`).join('')}</table>` : ''}
    </details>
    ${fail ? '' : `<p style="color:var(--muted);font-size:14px">${S.loans.length} loans, ${fmt(giltBook())} of gilts and ${fmt(S.deposits)} of deposits carry into ${S.year + 1}, along with your customers' trust and the regulator's memory.</p>`}

    <div class="rowbtn">${fail || S.scenario ? '' : `<button type="button" class="btn primary" id="ovGo">Continue into ${S.year + 1}</button>`}${S.debrief && S.debrief.length ? '<button type="button" class="btn neutral" id="ovDebrief">Notes from the executive team</button>' : ''}${S.yr && S.yr.mon.length > 1 ? '<button type="button" class="btn neutral" id="ovReplay">Replay the year</button>' : ''}<button type="button" class="btn link" id="ovPaper">Read The Fiscal Herald again</button>${S.scenario ? `<button type="button" class="btn primary" id="ovRetry">Try ${esc(SCENARIOS[S.scenario].name.replace(/^The /, 'the '))} again</button><button type="button" class="btn neutral" id="ovMenu">Main menu</button>` : `<button type="button" class="btn ${fail ? 'primary' : 'neutral'}" id="ovNew">Start a new bank</button>`}</div>`);
  const go = $('#ovGo'); if (go) go.onclick = () => { dispatch({ type:"nextYear" }); save(); play(); };
  const nw = $('#ovNew'); if (nw) nw.onclick = () => { clearSave(); start({ fresh:true }); };
  const rt = $('#ovRetry'); if (rt) rt.onclick = () => startScenario(S.scenario);
  const mn = $('#ovMenu'); if (mn) mn.onclick = () => { clearSave(); S = null; titleScreen(); };
  const pp = $('#ovPaper'); if (pp) pp.onclick = herald;
  const db = $('#ovDebrief'); if (db) db.onclick = debriefScreen;
  const rp = $('#ovReplay'); if (rp) rp.onclick = replayScreen;
  offerLiteracy();
}

/* year-end debrief: notes from the executive team, one idea each. Optional; the player can skip it. */
function debriefScreen(){
  const cards = (S.debrief || []).map(c => '<div class="note"><div class="eyebrow">' + esc(c.concept) + ' · ' + esc(c.area) + '</div><p><b>' + esc(c.what) + '</b></p><p>' + esc(c.why) + '</p><p class="dim">To think about: ' + esc(c.ask) + '</p></div>').join('');
  overlay('<div class="eyebrow">' + S.year + ' · notes from the executive team</div><h2>What the year taught</h2><p class="dim">Not a test. A few moments from your year, and the idea behind each.</p>' + cards + '<div class="rowbtn"><button type="button" class="btn primary" id="dbBack">Back to the rating</button></div>');
  $('#dbBack').onclick = endScreen;
}

/* ---------- Ambitions (long-term goals) and the year in review ---------- */
function ambitionHTML(a){
  return `<div class="amb${a.done ? ' done' : ''}"><div class="ambh"><b>${esc(a.name)}</b><span>${esc(a.shown)}</span></div><p class="dim">${esc(a.blurb)}</p>
    <progress value="${a.pct.toFixed(3)}" max="1" aria-label="${esc(a.name)}: ${esc(a.shown)}"></progress></div>`;
}
function goalsPanel(){
  const list = ambitionFacts(), done = list.filter(a => a.done).length;
  overlay(`${bankTop('goals')}<div class="eyebrow">Long-term goals</div><h2>Ambitions</h2>
    <p class="dim">Optional, and they run across all your years. ${done} of ${list.length} done. They are checked as each year ends.</p>
    <div class="ambs">${list.slice().sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || b.pct - a.pct).map(ambitionHTML).join('')}</div>
    ${bankFoot()}`);
  $('#ovGo').onclick = closeOverlay; bankWire(); tabSel('bank');
}
function ambitionsYearEnd(){
  if (!S.amb || S.scenario) return '';
  const list = ambitionFacts(), fresh = list.filter(a => a.fresh), next = list.filter(a => !a.done).sort((a, b) => b.pct - a.pct).slice(0, 2);
  if (!fresh.length && !next.length) return '';
  return `<h3>Ambitions</h3>${fresh.map(a => `<div class="note ambnew"><div class="eyebrow">Ambition reached</div><p><b>${esc(a.name)}</b> ${esc(a.blurb)}</p></div>`).join('')}
    ${next.length ? `<div class="ambs">${next.map(ambitionHTML).join('')}</div>` : ''}`;
}
function replayScreen(){
  const R = yearReplay(), mon = R.months;
  const moment = m => `<div class="moment ${m.good ? 'good' : 'bad'}"><span class="mm">${esc(m.name.slice(0, 3))}</span><div><b><span aria-hidden="true">${m.good ? '▲' : '▼'}</span> ${esc(m.head)}</b><p>${esc(m.text)}</p></div></div>`;
  overlay(`<div class="eyebrow">${R.year} · the year in review</div><h2>How the year went</h2>
    <p>You made ${R.decisions} decision${R.decisions === 1 ? '' : 's'}. The bank ${R.profit >= 0 ? 'made' : 'lost'} ${fmt(Math.abs(R.profit))}, and the capital ratio went from ${pc(R.capStart)} to ${pc(R.capNow)}${R.lowCap ? `, with its lowest point in ${esc(R.lowCap.name)} at ${pc(R.lowCap.cap)}` : ''}.</p>
    <div class="charts two">${chartHTML({ label: 'Capital ratio', pts: mon.map(m => m.cap), min: MIN_CAP, fmt: v => pc(v) })}${chartHTML({ label: 'Profit each month', pts: mon.map(m => m.profit), fmt: v => fmt(v, true) })}</div>
    ${R.moments.length ? `<h3>Moments that mattered</h3><div class="moments">${R.moments.map(moment).join('')}</div>` : ''}
    ${R.focus ? `<div class="note"><div class="eyebrow">For next year</div><p>${esc(R.focus)}</p></div>` : ''}
    <details class="more"><summary>Month by month</summary><table class="rtable"><thead><tr><th scope="col">Month</th><th scope="col">Profit</th><th scope="col">Capital</th><th scope="col">Biggest item</th></tr></thead><tbody>
      ${mon.map(m => `<tr><th scope="row">${esc(m.name.slice(0, 3))}</th><td style="color:${m.profit < 0 ? 'var(--bad)' : 'var(--good)'}">${fmt(m.profit, true)}</td><td>${pc(m.cap)}</td><td>${m.top ? esc(m.top.label) : '–'}</td></tr>`).join('')}</tbody></table></details>
    <div class="rowbtn"><button type="button" class="btn primary" id="rpBack">Back to your rating</button></div>`);
  $('#rpBack').onclick = endScreen;
}

function booksPanel(){
  const mv = giltMV(), bk = giltBook(), cap = capital();
  const row = (l, v, sub) => `<tr${sub ? ' class="sub"' : ''}><td>${l}</td><td>${typeof v === 'number' ? fmt(v) : v}</td></tr>`;
  const A = [ ['Reserves at the Bank of England', S.cash], [fairValued() ? 'Gilts (at market value)' : 'Gilts (at cost)', giltCarry()], ['Mortgages', loanSum('mortgage')], ['Business loans', loanSum('business')], ['Personal loans and cards', loanSum('retail')], ['Older loan book', S.legacy] ].concat(S.retained > 0 ? [['Kept share of sold mortgages', S.retained]] : []);
  const totA = assets();
  const L = S.last ? S.last.pl : null;
  const nim = L ? ((L.intLoans + L.intGilts + L.intRes + L.intDep + L.intCB) * 12 / totA) : null;
  overlay(`${bankTop('books')}<div class="eyebrow">${MONTHS[Math.min(S.month, 11)]} ${S.year}</div><h2>The books</h2>
    <div class="bs2">
      <div><h3>What you own</h3><table class="ledger">${A.map(a => row(a[0], a[1])).join('')}${bk && !fairValued() ? row('Gilts at market value', fmt(mv) + (mv < bk - 0.5 ? ` (${fmt(mv - bk)})` : ''), true) : ''}<tr class="tot"><td>Total</td><td>${fmt(totA)}</td></tr></table></div>
      <div><h3>What you owe, and your capital</h3><table class="ledger">${row('Customer deposits', S.deposits)}${S.cb > 0 ? row('Bank of England loan', S.cb) : ''}${S.wholesale > 0 ? row('Wholesale borrowing', S.wholesale) : ''}${S.bonds > 0 ? row('Fixed-term bonds', S.bonds) : ''}${row('Capital', cap)}<tr class="tot"><td>Total</td><td>${fmt(S.deposits + S.cb + (S.wholesale || 0) + (S.bonds || 0) + cap)}</td></tr></table></div>
    </div>
    ${S.wm ? `<div><h3>Managed for clients, not on your balance sheet</h3><table class="ledger">${row(termBtn('Client assets', 'Client assets'), aum())}${row('Private clients', String(S.wm.clients.filter(x => !x.block).length), true)}${S.wm.clients.filter(x => x.block).map(b => row(b.name, b.amt, true)).join('')}${row('Yearly fees at current size', fmt(S.wm.clients.reduce((a, c) => a + c.amt * (c.house ? HOUSE_FEE : STD_FEE) / 100, 0)), true)}</table></div>` : ''}
    <div class="grid2">
      <div class="stat"><span>${termBtn('Capital ratio', 'Capital ratio')}</span><b>${pc(capRatio())}</b></div>
      <div class="stat"><span>${termBtn('Liquidity', 'Liquidity')}</span><b>${pc(liqRatio())}</b></div>
      <div class="stat"><span>Savings rate</span><b>${S.savRate.toFixed(2)}%</b></div>
      <div class="stat"><span>Net interest margin</span>${nim == null ? '<b style="font-size:13px;font-weight:600;color:var(--muted)">after month end</b>' : '<b>' + pc(nim, 2) + '</b>'}</div>
    </div>
    <p style="color:var(--muted);font-size:13px">Capital ratio = capital ÷ ${fmt(rwa())} risk-weighted assets. Mortgages count at 35–50%, other loans at 100%, gilts and reserves at zero.</p>
    ${bankFoot()}`);
  $('#ovGo').onclick = closeOverlay; bankWire(); tabSel('bank');
}

function tabSel(name){
  const on = { counter: view === 'counter' && !name, inbox: view === 'inbox' && !name, bank: name === 'bank', policy: name === 'policy' };
  $('#tabCounter').setAttribute('aria-current', on.counter); $('#tabInbox').setAttribute('aria-current', on.inbox);
  $('#bankBtn').setAttribute('aria-current', on.bank); $('#policyBtn').setAttribute('aria-current', on.policy);
}
let ovReturn = null;
function overlay(html){ Scene.setPaused(false); $('#pop').hidden = true; if (typeof view !== 'undefined') tabSel(); const o = $('#ov'); if (o.hidden) ovReturn = document.activeElement; o.innerHTML = `<div class="panel" role="dialog" aria-modal="true" tabindex="-1">${html}</div>`; o.hidden = false; const pn = o.querySelector('.panel'), hd = pn.querySelector('h2'); pn.scrollTop = 0; if (hd){ hd.id = 'ovTitle'; pn.setAttribute('aria-labelledby', 'ovTitle'); } else pn.setAttribute('aria-label', 'Bank Manager'); const b = $('#ovGo'); (b || pn).focus({ preventScroll:true }); }
function closeOverlay(){ Scene.setPaused(false); menuConfirm = false; $('#pop').hidden = true; if (typeof view !== 'undefined') tabSel(); $('#ov').hidden = true; $('#ov').innerHTML = ''; if (ovReturn && ovReturn.isConnected){ try { ovReturn.focus({ preventScroll:true }); } catch (e) {} } ovReturn = null; }

/* recurring customers: the household behind a name, with the month's budget, the credit score over time and what has happened to them */
function nameHTML(c){ return c.h && c.h.hh != null && S.households ? '<button type="button" class="hhlink" data-hh="' + c.h.hh + '">' + esc(c.who.name) + '</button>' : esc(c.who.name); }
function householdCard(h){
  const last = h.hist[h.hist.length - 1];
  let bar = '<p class="dim">No months yet.</p>', line = '';
  if (last){
    const inc = Math.max(1, last.income), spent = Math.min(100, Math.round(last.spend / inc * 100)), saved = Math.max(0, 100 - spent), over = last.spend > last.income;
    bar = '<div class="hbar" role="img" aria-label="Of ' + fmt(inc / 1000) + ' coming in, ' + fmt(last.spend / 1000) + ' went out"><span class="out" style="width:' + (over ? 100 : spent) + '%"></span>' + (over ? '' : '<span class="kept" style="width:' + saved + '%"></span>') + '</div><p class="dim">Coming in ' + fmt(inc / 1000) + ' a month · going out ' + fmt(last.spend / 1000) + (over ? ' · overspending' : ' · keeping ' + fmt(last.saved / 1000)) + '</p>';
    const pts = h.hist.map(x => x.score), lo = Math.min(...pts, 300), hi = Math.max(...pts, 999), w = 220, ht = 44;
    line = pts.length > 1 ? '<svg class="spark" viewBox="0 0 ' + w + ' ' + ht + '" role="img" aria-label="Credit score from ' + pts[0] + ' to ' + pts[pts.length - 1] + '"><polyline fill="none" stroke="currentColor" stroke-width="2" points="' + pts.map((p, i) => (i / (pts.length - 1) * w).toFixed(1) + ',' + (ht - 3 - (p - lo) / (hi - lo) * (ht - 6)).toFixed(1)).join(' ') + '"/></svg>' : '';
  }
  const fundM = last ? last.fund : 0;
  return '<div class="note"><div class="eyebrow">' + esc(h.label) + ', ' + h.age + '</div><p><b>' + esc(h.name) + '</b> · goal: ' + esc(h.goal) + '</p>' + bar +
    '<p class="dim">Emergency fund: ' + (fundM >= 0 ? fundM.toFixed(1) + ' months of spending' : 'overdrawn') + ' · credit score ' + Math.round(h.score) + ' / 999' + (h.loanId ? ' · has a loan with you' : '') + '</p>' + line +
    (h.notes.length ? '<p class="dim">' + h.notes.slice(-3).reverse().map(n => esc(n.t)).join(' ') + '</p>' : '') + '</div>';
}
function householdScreen(focus){
  const list = S.households.slice().sort((a, b) => (a.id === focus ? -1 : b.id === focus ? 1 : a.id - b.id));
  overlay('<div class="eyebrow">Your regular customers</div><h2>Households</h2><p class="dim">The same people come back year after year. What you decide for them shows up in their money.</p>' + list.map(householdCard).join('') + '<div class="rowbtn"><button type="button" class="btn primary" id="hhBack">Close</button></div>');
  $('#hhBack').onclick = closeOverlay;
}
document.addEventListener('click', e => { const b = e.target.closest('.hhlink'); if (b && S && S.households) householdScreen(+b.dataset.hh); });
$('#hhBtn').onclick = () => householdScreen();

/* policy: the pricing and credit rules. Everyone starts on the executive team's; an area becomes editable when the board hands it over. */
const POLICY_FIELDS = {
  pricing: { title: 'Pricing', rows: [
    ['mortgageSpread', 'Mortgage spread over Bank Rate', '% points', 0.05, "Dearer than the executive team's spread and most applicants go elsewhere."],
    ['mortgagePremium', 'Extra rate for a risky mortgage', '% points', 0.05, 'Added when you offer a higher-rate mortgage to a risky applicant.'],
    ['personalLow', 'Personal loan, standard rate', '%', 0.1, 'Above the market rate, some customers take a cheaper loan elsewhere.'],
    ['personalHigh', 'Personal loan, higher rate', '%', 0.1, 'For riskier customers. The higher it is, the fewer accept.'],
    ['cardRate', 'Credit card rate', '% APR', 0.1, 'Customers in debt cannot leave, but they default more and the regulator takes notice.']] },
  credit: { title: 'Credit policy', rows: [
    ['mortgageMaxLtv', 'Mortgage: most we lend of the price', '% (LTV)', 1, 'Loosening it wins customers and brings losses later.'],
    ['mortgageMaxLti', 'Mortgage: most times income', '×', 0.1, ''],
    ['mortgageMaxAff', 'Mortgage: most of take-home pay', 'share', 0.01, 'The repayment as a share of take-home pay.'],
    ['mortgageMinScore', 'Mortgage: lowest credit score', '/ 999', 5, ''],
    ['personalMinScore', 'Personal loan: lowest credit score', '/ 999', 5, ''],
    ['personalMaxDebtRatio', 'Personal loan: most debt against a year\'s income', '×', 0.05, 'Existing debts plus the new loan.']],
    note: 'Saving these takes over the lending desk. From then on your policy decides each mortgage and personal loan application: approved and declined ones are processed at once, and only the borderline cases reach your counter. The bank also receives more applications than a branch counter would. A policy that is too loose lends to people who default. One that is too tight turns away good customers.' },
  treasury: { title: 'Treasury', rows: [
    ['liquidityTarget', 'Cash to keep, as a share of deposits', 'share', 0.01, 'Cash above this is invested in gilts each month. If cash falls well below it, gilts are sold, at their market value, to restore it.'],
    ['longShare', 'Share of any surplus put into 10-year gilts', 'share, 0 to 1', 0.1, 'Long gilts pay more but lose value when rates rise. The rest goes into 2-year gilts.'],
    ['hedgeTarget', 'Fixed-rate mortgages protected by swaps', 'share, 0 to 1.5', 0.1, 'A swap pays a fixed rate and receives Bank Rate. It protects the margin if rates rise, but costs about 0.1 points a year, pays out when rates fall, and needs cash collateral when it is under water. Above 1 you are betting on higher rates. Swaps cannot be cancelled.'],
    ['hedgeYears', 'Swap term', 'years, 1 to 5', 1, 'Longer swaps lock the protection in for longer, and the losses.']],
    note: 'Saving these takes over treasury. Your treasurer follows these rules every month and stops asking you each time.' },
  funding: { title: 'Funding', rows: [
    ['boeTarget', 'Bank of England borrowing to keep drawn', '£k', 250, 'Borrowed against your loans (after a 30% haircut) at Bank Rate plus 1%. Always available, but it appears in the Herald and costs board confidence for as long as it is out. 0 means none, except in an emergency.'],
    ['savingsSpread', 'Savings rate against the market', '% points', 0.1, 'Your rate is the market rate plus this. Higher draws deposits in and costs more on every pound saved.'],
    ['wholesaleTarget', 'Wholesale borrowing, as a share of deposits', 'share', 0.05, 'Borrowed from other banks for three months at a time. Dearer than savings, and in a freeze nobody renews.'],
    ['bondTarget', 'Fixed-term bonds, as a share of deposits', 'share', 0.05, 'Locked in for the term and cannot leave early. Watch for many maturing together.'],
    ['bondTermYears', 'Bond term', 'years, 1 to 3', 1, 'Longer terms pay a little more and lock the rate in.'],
    ['bondPremium', 'Bond rate above the market', '% points', 0.1, 'What you pay to attract bond money. A fixed rate is a bad deal if rates then fall.'],
    ['largeCap', 'Most deposits large depositors may hold', 'share', 0.05, 'Housing associations, councils and firms: big, cheap deposits that can all leave in one decision. 0 declines them all.'],
    ['poolWhenShort', 'Sell a mortgage pool when liquidity is short', '0 no, 1 yes', 1, 'Brings in cash and frees capital, but you keep 5% of the risk and the first losses, and the price falls in a stressed market.'],
    ['poolShare', 'Share of current mortgages in a pool', 'share', 0.05, ''],
    ['poolMode', 'Which mortgages go in', '0 best, 1 worst, 2 largest', 1, 'Selling the best loans leaves you with weaker ones.']],
    note: 'Saving these takes over funding. Your savings rate follows the market from then on, and the Bank Rate cards stop.' },
  growth: { title: 'Growth', rows: [
    ['launchBtl', 'Launch buy-to-let mortgages', '0 no, 1 yes', 1, 'Higher margins than residential mortgages, but losses rise when rents fall or rates rise.'],
    ['launchOverdraft', 'Launch business overdrafts and asset finance', '0 no, 1 yes', 1, 'Fee income and sticky relationships. A sector downturn hits a whole cohort at once.'],
    ['launchIsa', 'Launch ISAs and regular savers', '0 no, 1 yes', 1, 'Sticky deposits at a costly rate. Savers move at the start of each tax year.'],
    ['launchBuilder', 'Launch a credit builder card', '0 no, 1 yes', 1, 'New customers who become profitable later. High early losses.'],
    ['launchBnpl', 'Launch buy now, pay later', '0 no, 1 yes', 1, 'Fast volume and merchant fees, thin margins, and big losses in a downturn.'],
    ['launchPackaged', 'Launch packaged accounts with insurance', '0 no, 1 yes', 1, 'Monthly fees. Tempting to mis-sell to people who cannot claim.'],
    ['launchGreen', 'Launch green home improvement loans', '0 no, 1 yes', 1, 'Demand from homeowners and good press. Installers sometimes commit fraud.'],
    ['marketing', 'Marketing spend, all products', '£k a month', 1, 'Shared across the products you run. About £3k a product a month brings in the full volume; none gives about half.'],
    ['feeLevel', 'Fees', '0 low, 1 standard, 2 high', 1, 'Higher fees earn more and are more likely to fail the regulator\'s fair value review, which forces refunds and cuts the price.'],
    ['bonusSales', 'Share of bonus tied to sales', 'share, 0 to 1', 0.1, 'Volume-heavy schemes raise sales within a quarter. Sales made under pressure may be mis-sold.'],
    ['bonusQuality', 'Share of bonus tied to quality', 'share, 0 to 1', 0.1, 'Complaints, arrears and file checks. Offsets the pressure to sell.'],
    ['salesTarget', 'Sales target', '0.5 to 1.5 times normal', 0.1, 'A higher target adds pressure.'],
    ['qualityGate', 'Quality gate on sales', '0 no, 1 yes', 1, 'Checks before a sale goes through. Cuts mis-selling by about two thirds and costs some sales.'],
    ['retraining', 'Retraining spend', '£k a month', 0.5, 'Slowly rebuilds the culture. About £3k a month has most of the effect.'],
    ['clawback', 'Claw back past bonuses', '0 no, 1 yes', 1, 'Once: lifts the culture, costs some money and three months of sales.']]
    .concat(GROWTH_TOWNS.map(t => [t.key, t.name + (t.sole ? ' (the only bank in town)' : ''), '0 closed or none, 1 hub, 2 branch', 1, 'Population ' + t.pop + '%, ' + Math.round(t.old * 100) + '% older, ' + Math.round(t.cash * 100) + '% reliant on cash. Closing saves about £6k a month and loses deposits and trust.'])),
    note: 'Saving these takes over growth. Offers to buy smaller lenders will start to arrive in your inbox.' },
  operations: { title: 'Operations', rows: OPS_TEAMS.map(([t, label]) => [staffKey(t), label + ' staff', 'people', 1, t === 'it' ? 'Sets how much change your IT team can deliver (12 points of load per person). Hiring takes two months and training a third; letting people go is immediate and costs.' : 'People who handle ' + ({ counter: 'customers at the counter', credit: 'loan applications referred to people', fraud: 'fraud alerts', fincrime: 'money-laundering alerts', complaints: 'complaints' })[t] + '. Work beyond their capacity becomes a backlog.'])
    .concat([
    ['overtime', 'Overtime', '0 off, 1 on', 1, 'Adds 20% capacity for up to three months, at a premium. After that people burn out and leave.'],
    ['fraudSensitivity', 'Fraud alert sensitivity', 'share, 0 to 1', 0.05, 'Higher catches more fraud and creates far more false alarms, which block genuine customers and swamp your analysts.'],
    ['amlSensitivity', 'Money-laundering alert sensitivity', 'share, 0 to 1', 0.05, 'Higher catches more laundering and swamps the team. Lower misses laundering, and the fine arrives months later.'],
    ['coreMigration', 'Core banking migration', '0 no, 1 phased, 2 big-bang', 1, 'Lowers running costs by about £6k a month when finished. Big-bang is cheaper and faster but risks a multi-day outage on cutover.'],
    ['paymentsUpgrade', 'Payments upgrade', '0 no, 1 yes', 1, 'Fewer failed payments and faster fraud checks. A small chance of an outage during the switchover.'],
    ['regReporting', 'Regulatory reporting platform', '0 no, 1 yes', 1, 'Makes a missed regulatory report much less likely.'],
    ['mobileApp', 'Mobile app rebuild', '0 no, 1 yes', 1, 'Fewer customers need the counter, but launch defects bring complaints.'],
    ['dataPlatform', 'Data and analytics platform', '0 no, 1 yes', 1, 'Fraud and laundering scoring improves a little. Benefits arrive slowly.'],
    ['outsourceCards', 'Outsource card processing', '0 no, 1 yes', 1, 'Saves about £4k a month. The supplier can fail, and the regulator still holds you responsible.'],
    ['outsourceContact', 'Outsource the contact centre', '0 no, 1 yes', 1, 'Saves about £3.5k a month, with the same risk.'],
    ['outsourceHosting', 'Outsource IT hosting', '0 no, 1 yes', 1, 'Saves about £5k a month, with the same risk.'],
    ['oversight', 'Oversight spend per outsourced supplier', '£k a month', 0.5, 'Reduces both the chance a supplier fails and the harm when it does. About £2.5k a month each is usually enough.']]),
    note: 'Saving these takes over operations. Every team has a capacity from now on. Projects started cannot be refunded if you stop them.' },
  capital: { title: 'Capital', rows: [
    ['capitalTarget', 'Capital ratio to stay above', 'ratio', 0.005, 'The regulator steps in below 10.5%. Holding much more than you need lowers the return the board sees.'],
    ['capitalAction', 'When below it', '0 to 3', 1, '0 raise shares, 1 sell half the new mortgages, 2 carry on, 3 sell a mortgage pool (set in Funding) and keep 5% of the risk.'],
    ['raiseAmount', 'Amount to raise', '£k', 50, 'Used when the action is 0. Shareholders are diluted.'],
    ['dividendPayout', "Share of each month's profit paid as dividends", 'share, 0 to 1', 0.05, 'Pleases shareholders and the board, up to 8 rating points at a 5% yield. Leaves the bank with less capital, and the regulator objects if you pay while below the minimum.']],
    note: 'Saving these takes over capital planning. The finance director acts for you when the ratio falls below your target.' } };
const ROLES = ['Finance director', 'Chief risk officer', 'Treasurer', 'Head of operations'];
/* Executive team, early warnings and the stress test: three screens inside the Policy tab, one control area per screen. */
function execTop(which){
  const b = (k, t) => `<button type="button" data-seg="${k}" aria-pressed="${which === k}">${t}</button>`;
  return `<div class="seg three" role="group" aria-label="Section">${b('team', 'Team')}${b('settings', 'Settings')}${b('stress', 'Stress test')}</div>`;
}
function execWire(){
  const sg = $('#ov .seg'); if (sg) sg.onclick = e => { const b = e.target.closest('[data-seg]'); if (b) execScreen(b.dataset.seg); };
  const c = $('#plBack'); if (c) c.onclick = closeOverlay;
}
function execScreen(which, msg, isErr){ if (which === 'settings') policyScreen(msg, isErr); else if (which === 'stress') stressScreen(msg, isErr); else teamScreen(); }
function stressLine(){
  if (!S.stress) return '<p class="dim">No stress test run yet. Open the Stress test tab before you change risky settings.</p>';
  const st = S.stress, v = stressVerdict(st);
  return `<p class="dim adv-line ${v[1]}">Stress test, ${st.scenario === 'rates' ? 'rate shock' : 'recession'} (${MONTHS[Math.min(st.month, 11)]} ${st.year}${st.custom ? ', unsaved settings' : ''}): ${esc(v[0])}</p>`;
}
function boardBlock(){
  if (!S.board) return '<div class="note"><div class="eyebrow">The board</div><p class="dim">The board starts to watch you once you take over your first area. It meets every three months.</p></div>';
  const B = S.board, c = Math.round(B.conf);
  const next = 3 - (S.month % 3), hist = B.hist.slice(-6).map(h => `<span class="chip">${h.year} Q${h.q} · ${h.conf}</span>`).join(' ');
  return `<div class="note"><div class="eyebrow">The board</div><p><b>Confidence ${c} / 100 · ${esc(boardBand(c))}</b></p>
    <div class="hbar" role="img" aria-label="Board confidence ${c} out of 100"><span class="${c < 40 ? 'out' : 'kept'}" style="width:${c}%"></span></div>
    <p class="dim">Next board meeting in ${next} month${next === 1 ? '' : 's'}. Below 20 at two meetings in a row, or enforcement action by the regulator, ends your time as chief executive.</p>${hist ? `<p class="dim">${hist}</p>` : ''}</div>`;
}
function shareBlock(){
  if (!S.px || !S.px.hist.length) return '';
  const P = S.px, h = P.hist, last = h[h.length - 1], first = h[0], chg = last.price / first.price - 1;
  const lo = Math.min(...h.map(x => x.price)), hi = Math.max(...h.map(x => x.price)), w = 220, ht = 44, span = Math.max(0.01, hi - lo);
  const line = h.length > 1 ? `<svg class="spark" viewBox="0 0 ${w} ${ht}" role="img" aria-label="Share price from £${first.price.toFixed(2)} to £${last.price.toFixed(2)}"><polyline fill="none" stroke="currentColor" stroke-width="2" points="${h.map((x, i) => (i / (h.length - 1) * w).toFixed(1) + ',' + (ht - 4 - (x.price - lo) / span * (ht - 8)).toFixed(1)).join(' ')}"/></svg>` : '';
  const dps = (S.divPaid || 0) / P.shares;
  return `<div class="note"><div class="eyebrow">Shareholders</div><p><b>Share price £${last.price.toFixed(2)}</b> <span class="dim">${chg >= 0 ? '+' : '−'}${pc(Math.abs(chg), 0)} since ${MONTHS[first.m].slice(0, 3)} ${first.y}</span></p>${line}
    <p class="dim">Book value £${last.book.toFixed(2)} a share × ${last.mult.toFixed(2)} · ${Math.round(P.shares)}k shares${dps > 0 ? ` · dividends £${dps.toFixed(3)} a share this year` : ''}${P.issues.length ? ` · ${P.issues.length} share issue${P.issues.length === 1 ? '' : 's'}, last ${fmt(P.issues[P.issues.length - 1].amt)} at £${P.issues[P.issues.length - 1].price.toFixed(2)}` : ''}</p>
    <p class="dim">The multiple rises when return on equity beats 10% and falls with volatile profits, enforcement and a capital breach.</p></div>`;
}
function instrumentsHTML(){
  const rows = fundingInstruments(); if (!rows.length) return '';
  const lab = { wholesale: 'Wholesale', bond: 'Bond', boe: 'Bank of England' };
  const due = d => d == null ? 'on demand' : MONTHS[d % 12].slice(0, 3) + ' ' + Math.floor(d / 12);
  return `<h3>Funding instruments</h3><div class="lad ins"><span></span><b>Amount</b><b>Rate</b><b>Due</b>${rows.slice(0, 12).map(r => `<span>${lab[r.kind]}</span><span>${fmt(r.amt)}</span><span>${r.rate.toFixed(2)}%</span><span>${due(r.due)}</span>`).join('')}</div>${rows.length > 12 ? `<p class="dim">and ${rows.length - 12} more.</p>` : ''}`;
}
function opsHTML(){
  if (!opsOwned()) return '';
  const O = S.ops, rec = opsRecommended(), pol = S.policy.operations;
  if (!O || !O.last.length) return `<h3>Operations</h3><p class="dim">You have taken over operations. The first month's workloads will appear here after you close the books.</p>`;
  const lab = Object.fromEntries(OPS_TEAMS), pend = t => O.hiring.filter(h => h.team === t).reduce((a, h) => a + h.n, 0);
  const rows = O.last.map(r => `<span>${esc(lab[r.team])}</span><span>${r.staff}${pend(r.team) ? ' (+' + pend(r.team) + ')' : ''} / ${rec[r.team]}</span><span style="color:${r.util > 1.1 ? 'var(--bad)' : r.util > 0.95 ? 'var(--warn)' : 'inherit'}">${pc(r.util, 0)}</span><span>${r.backlog > 0.5 ? Math.round(r.backlog) + ' cases' : '–'}</span>`).join('');
  const proj = O.projects.map(p => `<span>${esc(PROJECT_DEFS[p.key].name)}</span><span>${Math.max(0, Math.ceil(p.left))} months left</span><span>load ${p.load}</span><span>${fmt(p.cost / p.months)} a month</span>`).join('');
  const inc = O.incidents.slice(-3).reverse().map(i => `<p class="dim">${MONTHS[Math.min(i.m, 11)].slice(0, 3)} ${i.y}: ${esc(i.cause)} (${fmt(i.cost)}).</p>`).join('');
  return `<h3>Operations</h3><div class="lad ops"><span></span><b>Staff / advised</b><b>Load</b><b>Backlog</b>${rows}</div>
    <p class="dim">${O.otActive ? 'Overtime is on. ' : ''}Change capacity: ${O.projects.length ? pc(O.m.meter, 0) + ' of what your IT team can deliver.' : 'no projects running.'}${Object.keys(O.done).length ? ' Finished: ' + Object.keys(O.done).map(k => PROJECT_DEFS[k].name.toLowerCase()).join(', ') + '.' : ''}</p>
    ${proj ? `<div class="lad ops"><span></span><b>Time</b><b>IT load</b><b>Spend</b>${proj}</div>` : ''}${inc}`;
}
function growthHTML(){
  if (!growthOwned()) return '';
  const G = S.growth;
  if (!G || !G.last) return `<h3>Growth</h3><p class="dim">You have taken over growth. The first month's results will appear here after you close the books.</p>`;
  const now = S.year * 12 + S.month, f = growthSize(), rows = Object.entries(G.products).map(([k, p]) => `<span>${esc(GROWTH_PRODUCTS[k].name)}</span><span>${now - p.start} mo${p.ended != null ? ', ending' : ''}</span><span>${p.last != null ? fmt(p.last, true) : '–'}</span><span>${p.repriced ? 'repriced' : '–'}</span>`).join('');
  const towns = GROWTH_TOWNS.map(t => `<span>${esc(t.name)}</span><span>${G.townState[t.key] === 0 && t.base === 0 ? 'not open' : ['closed', 'hub', 'branch'][G.townState[t.key]]}</span><span>${t.pop}%</span><span>${Math.round(t.old * 100)}% / ${Math.round(t.cash * 100)}%</span>`).join('');
  const acq = G.acq.map(a => `<span>${esc(a.name)}</span><span>${fmt(a.price)}</span><span>${fmt(a.goodwill)} goodwill</span><span>${now - a.start < 12 ? 'integrating' : now - a.start < 24 ? 'settling' : 'done'}</span>`).join('');
  return `<h3>Growth</h3>${rows ? `<div class="lad ops"><span></span><b>Age</b><b>Last month</b><b>Review</b>${rows}</div>` : '<p class="dim">No products launched.</p>'}
    <p class="dim">Sales volume ${pc(G.sidx - 1, 0) === '0%' ? 'at the normal level' : (G.sidx > 1 ? '+' : '−') + pc(Math.abs(G.sidx - 1), 0) + ' on normal'}. ${G.upheld.length} mis-selling complaint${G.upheld.length === 1 ? '' : 's'} upheld in the last year; ${G.whistle} whistleblower report${G.whistle === 1 ? '' : 's'} so far.</p>
    ${acq ? `<div class="lad ops"><span></span><b>Price</b><b>Goodwill</b><b>Status</b>${acq}</div>` : ''}
    <div class="tmap" role="img" aria-label="Towns: ${GROWTH_TOWNS.map(t => esc(t.name) + ' ' + (G.townState[t.key] === 0 && t.base === 0 ? 'not open' : ['closed', 'hub', 'branch'][G.townState[t.key]])).join(', ')}">${GROWTH_TOWNS.map(t => { const st = G.townState[t.key] === 0 && t.base === 0 ? 'none' : ['closed', 'hub', 'branch'][G.townState[t.key]], d = 14 + Math.round(t.pop * 0.9); return `<div class="tn ${st}"><i style="width:${d}px;height:${d}px"></i><span>${esc(t.name)}</span></div>`; }).join('')}</div>
    <div class="lad ops"><span></span><b>Now</b><b>Pop.</b><b>Older / cash</b>${towns}</div>`;
}
function ladderHTML(){
  const L = maturityLadder(), cell = x => x > 0.5 ? fmt(x) : '–';
  return `<h3>Funding ladder</h3><div class="lad"><span></span><b>Repaying</b><b>Falling due</b><b>After a run</b>${L.rows.map(r => `<span>${esc(r.label)}</span><span>${cell(r.inflow)}</span><span>${cell(r.outflow)}</span><span style="color:${r.cover < 0 ? 'var(--bad)' : 'inherit'}">${fmt(r.cover)}</span>`).join('')}</div>
    <p class="dim">Cash and gilts ${fmt(L.liquid)}. A stressed run on deposits would take ${fmt(L.stressRun)} in the first month${L.collateral > 0.5 ? `, and ${fmt(L.collateral)} of cash is tied up as swap collateral` : ''}. Liquidity coverage ${pc(L.lcr, 0)}.</p>`;
}

function gaugeHTML(g){
  const w = Math.max(0, Math.min(100, g.value / g.max * 100)), m = Math.max(0, Math.min(100, g.min / g.max * 100));
  const lim = g.key === 'trust' || g.key === 'board' ? String(g.min) : pc(g.min, g.key === 'liq' ? 0 : 1);
  return `<div class="gauge ${g.status}" role="group" aria-label="${esc(g.label)} ${esc(g.shown)}, ${g.status === 'ok' ? 'fine' : g.status === 'watch' ? 'close to the limit' : 'below the limit'}">
    <span class="gl">${g.term ? termBtn(esc(g.label), g.term) : esc(g.label)}</span><span class="gv">${esc(g.shown)}</span>
    <div class="gtrack" aria-hidden="true"><i style="width:${w.toFixed(1)}%"></i><u style="left:${m.toFixed(1)}%"></u></div>
    <span class="gnote">${g.status === 'alarm' ? 'Below the limit' : g.status === 'watch' ? 'Close to the limit' : 'Limit ' + esc(lim)}</span></div>`;
}
function chartHTML(s){
  const p = s.pts; if (p.length < 2) return `<div class="chart"><span class="cl">${esc(s.label)}</span><span class="gnote">Builds up as the year goes on.</span></div>`;
  const W = 200, H = 56, lo = Math.min(...p, s.min != null ? s.min : Infinity), hi = Math.max(...p, s.min != null ? s.min : -Infinity), span = Math.max(1e-9, hi - lo);
  const y = v => (H - 4 - (v - lo) / span * (H - 8)).toFixed(1), x = i => (i / (p.length - 1) * W).toFixed(1);
  return `<div class="chart"><span class="cl">${esc(s.label)}</span>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(s.label)} from ${esc(s.fmt(p[0]))} to ${esc(s.fmt(p[p.length - 1]))}">${s.min != null ? `<line x1="0" x2="${W}" y1="${y(s.min)}" y2="${y(s.min)}" stroke="var(--bad)" stroke-dasharray="4 3" stroke-width="1" opacity=".7"/>` : ''}<polyline fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" points="${p.map((v, i) => x(i) + ',' + y(v)).join(' ')}"/></svg>
    <span class="cv">${esc(s.fmt(p[p.length - 1]))}</span></div>`;
}
function dashboardHTML(){
  const d = dashboardFacts();
  return `<div class="gauges">${d.gauges.map(gaugeHTML).join('')}</div><div class="charts">${d.series.map(chartHTML).join('')}</div>`;
}
function tourHint(){
  let seen = false; try { seen = localStorage.getItem('bm-tour') === '1'; } catch (e) {}
  return seen ? '' : `<div class="hint" id="tourHint"><span>Each seat below reads the same numbers. Run a Stress test before you change anything risky.</span><button type="button" class="btn link" id="tourOk">Got it</button></div>`;
}
function roomPicture(){
  const f = roomFacts(), src = Scene.boardroom(); if (!src) return '';
  const word = { ok:'at ease', watch:'watching', alarm:'alarmed' };
  return `<img class="roomimg" src="${src}" alt="The meeting room. ${f.seats.map(s => s.role + ' ' + word[s.status]).join('. ')}.${f.board ? ' The board is ' + f.board + '.' : ''}">`;
}
function teamScreen(){
  const notes = advisers(), ind = indicators();
  const by = ROLES.map(r => `<div class="advs"><h3>${r}</h3>${notes.filter(n => n.role === r).map(n => `<div class="adv ${n.tone}"><p>${esc(n.text)}</p></div>`).join('')}</div>`).join('');
  const lab = { ok: 'OK', watch: 'Watch', alarm: 'Alarm' };
  const rows = ind.map(i => `<div class="ewi ${i.status}"><span class="pill ${i.status}">${lab[i.status]}</span><div><b>${esc(i.label)}</b><span class="num">${esc(i.shown)}</span></div></div>`).join('');
  overlay(`${execTop('team')}<div class="eyebrow">Chief Executive · ${MONTHS[Math.min(S.month, 11)]} ${S.year}</div><h2>Your executive team</h2>
    <p class="dim">Each adviser reads the same numbers from their own seat, so they will not always agree. ${S.meet ? 'Changes you table in Settings take effect at the start of next month, after this meeting.' : 'Changes you make in Settings apply to new decisions from now on.'}</p>
    ${roomPicture()}${tourHint()}${dashboardHTML()}${boardBlock()}${shareBlock()}${stressLine()}${by}<h3>Early warnings</h3><div class="ewis">${rows}</div>${ladderHTML()}${instrumentsHTML()}${opsHTML()}${growthHTML()}
    <details class="more"><summary>Resign as chief executive</summary><div class="acct" style="margin-top:8px"><p class="dim">Resigning ends the game. You are rated on the year so far.</p><button type="button" class="btn no" id="exResign">Resign</button></div></details>
    <div class="stickyfoot"><button type="button" class="btn link" id="plBack">Close</button></div>`);
  tabSel('policy'); execWire();
  const tk = $('#tourOk'); if (tk) tk.onclick = () => { try { localStorage.setItem('bm-tour', '1'); } catch (e) {} const h = $('#tourHint'); if (h) h.remove(); };
  $('#exResign').onclick = () => { try { dispatch({ type: 'resign' }); save(); closeOverlay(); herald(); } catch (e) { teamScreen(); } };
}
function stressScreen(msg, isErr){
  const st = S.stress, v = st ? stressVerdict(st) : null, num = (l, x) => `<div class="stat"><span>${l}</span><b>${x}</b></div>`;
  const card = st ? `<div class="adv ${v[1]}"><p><b>${esc(v[0])}</b></p></div>
    <div class="grid2">${num('Lowest capital ratio', pc(st.lowCap) + ' (month ' + st.lowCapMonth + ')')}${num('Lowest liquidity', pc(st.lowLiq, 0) + ' (month ' + st.lowLiqMonth + ')')}
    ${num('Shortest survival horizon', st.lowHorizon + ' days')}${num('Change in capital', fmt(st.capChange, true))}
    ${num('Bank of England borrowing, peak', st.peakBoe > 0 ? fmt(st.peakBoe) : 'none')}${num('Months run', String(st.ran || st.months))}</div>
    <p class="dim">Run in ${MONTHS[Math.min(st.month, 11)]} ${st.year} on ${st.custom ? 'settings that were typed in but not saved' : 'your saved settings'}. Your own bank was not changed.</p>` : '<p class="dim">Nothing run yet.</p>';
  overlay(`${execTop('stress')}<div class="eyebrow">Chief Executive</div><h2>Stress test</h2>
    <p>A copy of your bank goes through nine months of trouble starting next month, with a funding freeze and a stock market crash. Your rules run it. Cases that need a decision take their first option, as if the bank carried on as it is. The real bank does not change.</p>
    <div class="acct"><label>Scenario<select id="stScn"><option value="recession">Severe recession</option><option value="rates">Rate shock</option></select></label><p class="dim" id="stDesc"></p></div>
    <div class="acct"><div class="msg${isErr ? ' err' : ''}" role="status">${esc(msg || '')}</div>${card}
    <div class="stickyfoot"><button type="button" class="btn primary" id="stRun">Run on my saved settings</button><button type="button" class="btn link" id="plBack">Close</button></div></div>`);
  tabSel('policy'); execWire();
  if (st && st.scenario) $('#stScn').value = st.scenario;
  const desc = { recession: 'Unemployment up 4.5 points, house prices down 23%, Bank Rate cut, losses 2.5 times normal. Hurts lenders and anyone who has paid for protection against rising rates.', rates: 'Bank Rate rises to 6.5% over six months, inflation 8%, house prices down 12%, losses 1.5 times normal. Squeezes a bank with fixed-rate mortgages funded by deposits that reprice.' };
  const showDesc = () => { $('#stDesc').textContent = desc[$('#stScn').value]; }; $('#stScn').onchange = showDesc; showDesc();
  $('#stRun').onclick = () => { try { dispatch({ type: 'stress', scenario: $('#stScn').value }); save(); stressScreen('Done.'); } catch (e) { stressScreen(e.message, true); } };
}
function pendingBlock(){
  if (!S.meet) return '';
  const q = S.pq || [], titles = { pricing: 'Pricing', credit: 'Credit', treasury: 'Treasury', funding: 'Funding', capital: 'Capital', operations: 'Operations' };
  if (!q.length) return '<p class="dim">Executive meeting: changes you save here take effect at the start of next month.</p>';
  const lines = q.map(e => `<p class="dim"><b>${esc(titles[e.area])}:</b> ${e.release ? 'back to the executive team' : esc(Object.entries(e.values).map(([k, v]) => k + ' ' + v).join(', '))}</p>`).join('');
  return `<div class="note"><div class="eyebrow">Waiting for next month</div>${lines}<button type="button" class="btn link" id="plCancel">Withdraw these changes</button></div>`;
}
function policyScreen(msg, isErr){
  const sys = systemPolicy(), note = '<div class="msg' + (isErr ? ' err' : '') + '" role="status">' + esc(msg || '') + '</div>';
  const blocks = Object.keys(POLICY_FIELDS).map(area => {
    const f = POLICY_FIELDS[area];
    if (!S.progress.unlocked.includes(area)) return '<h3>' + f.title + '</h3><p class="dim">Not yet yours. The executive team sets it. The board hands over one area at a time after a strong year.</p>';
    return '<h3>' + f.title + '</h3><p class="dim">' + (S.policy.owner[area] === 'player' ? 'Set by you.' : "Still the executive team's values.") + '</p>' + (f.note ? '<p class="dim">' + f.note + '</p>' : '') + f.rows.map(r =>
      '<label>' + r[1] + ' <span class="dim">(' + r[2] + '; executive team: ' + sys[area][r[0]] + ')</span><input type="number" step="' + r[3] + '" data-area="' + area + '" data-key="' + r[0] + '" value="' + policyAfterMeeting(area)[r[0]] + '">' + (r[4] ? '<span class="dim">' + r[4] + '</span>' : '') + '</label>').join('');
  }).join('');
  overlay(execTop('settings') + '<div class="eyebrow">Chief Executive</div><h2>Policy</h2><div class="acct">' + stressLine() + pendingBlock() + (quietLeft() > 0 ? '<p class="dim">Quiet months: nothing outside the bank will go wrong for ' + (quietLeft() - 1) + ' more month' + (quietLeft() === 2 ? '' : 's') + ' after this one.</p>' : '') + blocks + note +
    '<div class="stickyfoot cols"><button type="button" class="btn primary full" id="plSave">Save changes</button><select id="plScn" aria-label="Stress test scenario"><option value="recession">Recession</option><option value="rates">Rate shock</option></select><button type="button" class="btn neutral" id="plTest">Stress test these settings first</button><button type="button" class="btn neutral full" id="plReset">Go back to the executive team values</button><button type="button" class="btn link" id="plBack">Close</button></div></div>');
  tabSel('policy'); execWire();
  $('#plTest').onclick = () => {
    const ov = {}; document.querySelectorAll('#ov input[data-key]').forEach(i => { const v = parseFloat(i.value), a = i.dataset.area, k = i.dataset.key; if (isFinite(v) && v !== S.policy[a][k]) (ov[a] = ov[a] || {})[k] = v; });
    try { dispatch({ type: 'stress', overrides: ov, scenario: $('#plScn').value }); save(); stressScreen(Object.keys(ov).length ? 'Run on the settings you typed in. They are not saved yet.' : 'You have not changed anything, so this ran on your saved settings.'); } catch (e) { policyScreen(e.message, true); }
  };
  const send = (area, values) => { try { dispatch({ type: 'setPolicy', area, values }); return null; } catch (e) { return e.message; } };
  $('#plSave').onclick = () => {
    const by = {}; document.querySelectorAll('#ov input[data-key]').forEach(i => { (by[i.dataset.area] = by[i.dataset.area] || {})[i.dataset.key] = parseFloat(i.value); });
    for (const area of Object.keys(by)){ const changed = {}; for (const k of Object.keys(by[area])) if (by[area][k] !== policyAfterMeeting(area)[k]) changed[k] = by[area][k];
      if (Object.keys(changed).length){ const err = send(area, changed); if (err) return policyScreen(err, true); } }
    save(); policyScreen(S.meet ? 'Saved for the meeting. These take effect at the start of next month.' : 'Saved. New applications use these values.');
  };
  $('#plReset').onclick = () => { for (const area of Object.keys(POLICY_FIELDS)) if (S.progress.unlocked.includes(area)){ try { dispatch({ type: 'setPolicy', area, release: true }); } catch (e) { return policyScreen(e.message, true); } } save(); policyScreen(S.meet ? "The executive team's values will take effect at the start of next month." : "Back on the executive team's values."); };
  const pc2 = $('#plCancel'); if (pc2) pc2.onclick = () => { for (const e of S.pq || []){ try { dispatch(S.policy.owner[e.area] === 'player' ? { type: 'setPolicy', area: e.area, values: Object.fromEntries(Object.keys(e.values || S.policy[e.area]).map(k => [k, S.policy[e.area][k]])) } : { type: 'setPolicy', area: e.area, release: true }); } catch (err) { /* nothing to withdraw */ } } save(); policyScreen('Withdrawn. Nothing is waiting for next month.'); };
  $('#plBack').onclick = closeOverlay;
}
$('#policyBtn').onclick = () => teamScreen();

/* glossary popover: it sits at the top, away from the action buttons, and goes away by itself */
{ let t = null; new MutationObserver(() => { clearTimeout(t); const pop = $('#pop'); if (!pop.hidden) t = setTimeout(() => { pop.hidden = true; }, 7000); }).observe($('#pop'), { attributes: true, attributeFilter: ['hidden'] }); }
document.addEventListener('click', e => {
  const t = e.target.closest('[data-term]'); const pop = $('#pop');
  if (t && TERMS[t.dataset.term]){ e.stopPropagation(); pop.innerHTML = `<b>${esc(t.dataset.term)}</b>${esc(TERMS[t.dataset.term])}`; pop.hidden = false; return; }
  if (!pop.hidden && !e.target.closest('#pop')) pop.hidden = true;
}, true);
$('#bankBtn').onclick = () => { if (!S) return; Snd.play('click'); booksPanel(); };
$('#goalsBtn').onclick = () => { if (!S || !S.scenario) return; const pop = $('#pop'); pop.innerHTML = `<b>${esc(SCENARIOS[S.scenario].name)}</b><div style="display:grid;gap:4px;margin-top:4px">${goalsHTML()}</div>`; pop.hidden = false; };
$('#tabCounter').onclick = () => { if (!S) return; Snd.play('click'); setView('counter'); };
$('#tabInbox').onclick = () => { if (!S) return; openKey = matchMedia('(min-width:880px)').matches ? openKey : null; $('#app').dataset.msg = ''; setView('inbox'); };
$('#contBtn').onclick = () => S && cont();

$('#hReg').onclick = () => { if (!S) return; const pop = $('#pop'); pop.innerHTML = `<b>Regulator</b>Standing ${Math.round(S.comp)}/100. Fines, missed reports and capital breaches lower it. At zero you lose your licence.`; pop.hidden = false; };
document.addEventListener('keydown', e => { if (e.key === 'Escape'){ $('#pop').hidden = true; if ($('#menuResume')){ closeOverlay(); return; } if (!$('#ov').hidden && $('#ovGo') && /Back/.test($('#ovGo').textContent)) closeOverlay(); else if ($('#ov').hidden && S) { menuConfirm = false; menuScreen(); } } });

/* save / restore */
const KEY = 'counting-house-v2';
function save(){ try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
function load(){ try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); return s && s.v === 2 ? migrate(s) : null; } catch (e) { return null; } }
function clearSave(){ try { localStorage.removeItem(KEY); } catch (e) {} }

function begin3(){ lastM = null; Scene.sync(); Scene.boards(); Scene.setCard(true); hud(false); }
function play(){
  closeOverlay(); begin3(); served = null; openKey = null; $('#app').dataset.msg = '';
  if (S.over){ endScreen(); return; }
  setView('counter'); renderCounter(true);
}
