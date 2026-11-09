/* ================= UI ================= */
const TERMS = {
  'Profit':'Your capital now minus your capital at the start of the year.',
  'Capital ratio':'Your own money as a share of risk-weighted loans. Below 10.5% the regulator intervenes; below 8% they close you.',
  'Liquidity':'Cash and gilts you could use tomorrow, as a share of deposits. Keep it above 10%.',
  'Customer trust':'How customers rate your treatment of them. Trust brings in deposits; lose it and they leave.',
  'LTV':'Loan-to-value: the loan as a share of the property price. Less deposit means less cushion if prices fall.',
  'LTI':'Loan-to-income: the loan divided by yearly income. Most UK lending is capped near 4.5×.',
  'Credit score':'A credit bureau\'s summary of past borrowing behaviour, out of 999.',
  'Affordability':'The monthly repayment against estimated take-home pay.',
  'KYC':'Know your customer: checking people are who they say they are before opening an account.',
  'Open banking':'With consent, reading an applicant\'s real transactions from their other bank.',
  'Persistent debt':'Paying more in interest and charges than off the balance for 18 months.',
  'DSCR':'Debt service cover: yearly profit divided by yearly loan repayments. Below 1.25× is tight.',
  '3-D Secure':'An extra check for online card payments, usually approval in the banking app.',
  'Fraud model':'Higher scores mean the payment looks more like known fraud.',
  'Confirmation of Payee':'Checks the name on the receiving account matches who the customer thinks they are paying.',
  'Tipping off':'Telling someone they are suspected of money laundering. It is a criminal offence.',
  'Bank Rate':'The Bank of England\'s interest rate. Cash you hold there earns it.',
  'Gilts':'UK government bonds. They pay a fixed rate, and their price falls when interest rates rise.',
  'Money at stake':'What the loan earns over Bank Rate, the rate your cash would earn sitting at the Bank of England, against what you would lose if it went bad.',
  'Net interest margin':'Interest earned minus interest paid, as a yearly share of everything you own.',
  'Cost/income':'Running costs as a share of income. Lower is better; well-run banks sit near 50%.',
  'Cost of risk':'Credit losses as a yearly share of your loans.',
  'Return on capital':'This year\'s profit as a share of the capital you started with. Peer banks shows what a typical bank made in the same economy.',
  'Client assets':'Money you invest for clients. It belongs to them, so it isn\'t on your balance sheet; you earn a yearly fee on it.',
  'Ongoing fee':'A yearly percentage of each client\'s portfolio, taken monthly. It rises and falls with markets.',
  'Attitude to risk':'How much ups and downs the client says they can stomach.',
  'Capacity for loss':'How much they could lose without it changing their life. It can matter more than what they say they can stomach.',
  'Inflation':'How fast prices are rising. Savings earning less than inflation buy less each year.',
  'Real return':'The interest rate minus inflation: what savings actually gain in buying power.',
  'Total interest':'Everything repaid on top of the amount borrowed over the whole term, if the rate stayed the same. A shorter term costs more each month but far less overall.',
  'Growth illustration':'A projection, not a promise. Investments can fall as well as rise, and yearly fees compound just like returns.',
  'PEP':'Politically exposed person: someone in, or close to, public office. Higher risk of corruption money, so more checks are required.',
};
function termBtn(text, key){ return key ? `<button type="button" class="term" data-term="${key}">${text}</button>` : text; }
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[ch]));

/* ---------- Sound (synthesised, no files) ---------- */
const Snd = (() => {
  let ctx = null, master = null, on = true, vol = 0.8; try { on = localStorage.getItem('bm-sound') !== '0'; const v = parseFloat(localStorage.getItem('bm-volume')); if (isFinite(v)) vol = Math.min(1, Math.max(0, v)); } catch (e) {}
  function ac(){ if (!ctx){ try { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = vol; master.connect(ctx.destination); } catch (e) { ctx = null; return null; } } if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return ctx; }
  function out(v){ const g = ctx.createGain(); g.gain.value = v; g.connect(master); return g; }
  function noise(dur, decay){ const b = ctx.createBuffer(1, Math.max(1, ctx.sampleRate * dur | 0), ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, decay); const n = ctx.createBufferSource(); n.buffer = b; return n; }
  function tone(f, at, dur, type, vol, slide){ const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, at); if (slide) o.frequency.exponentialRampToValueAtTime(slide, at + dur); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, at + dur); o.connect(g); g.connect(master); o.start(at); o.stop(at + dur + 0.05); }
  const fx = {
    stamp(){ const t = ctx.currentTime, n = noise(0.09, 3), f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1100; n.connect(f); f.connect(out(0.8)); n.start(t); tone(120, t, 0.16, 'sine', 0.55, 50); },
    paper(){ const t = ctx.currentTime, n = noise(0.28, 1.2), f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 0.6; n.connect(f); f.connect(out(0.22)); n.start(t); },
    bell(){ const t = ctx.currentTime; tone(1568, t, 1.3, 'sine', 0.16); tone(3920, t, 0.5, 'sine', 0.04); tone(2350, t, 0.9, 'sine', 0.03); },
    coin(){ const t = ctx.currentTime; tone(1318, t, 0.12, 'triangle', 0.13); tone(1976, t + 0.07, 0.3, 'triangle', 0.11); },
    bad(){ const t = ctx.currentTime; tone(233, t, 0.22, 'sawtooth', 0.035, 220); tone(175, t + 0.13, 0.4, 'sawtooth', 0.035, 160); },
    mail(){ const t = ctx.currentTime; tone(988, t, 0.1, 'sine', 0.07); tone(1319, t + 0.09, 0.2, 'sine', 0.07); },
    click(){ tone(700, ctx.currentTime, 0.035, 'square', 0.02); },
    vault(){ const t = ctx.currentTime; tone(70, t, 0.6, 'sine', 0.35, 45); const n = noise(0.5, 2), f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400; n.connect(f); f.connect(out(0.4)); n.start(t + 0.05); },
  };
  return {
    unlock(){ if (on) ac(); },
    play(k, delay){ if (!on || !ac()) return; const go = () => { try { fx[k](); } catch (e) {} }; delay ? setTimeout(go, delay) : go(); },
    toggle(){ on = !on; try { localStorage.setItem('bm-sound', on ? '1' : '0'); } catch (e) {} if (on) ac(); return on; },
    get on(){ return on; },
    get volume(){ return vol; },
    set volume(x){ vol = Math.min(1, Math.max(0, +x || 0)); try { localStorage.setItem('bm-volume', String(vol)); } catch (e) {} if (master) master.gain.value = vol; },
  };
})();
/* ---------- Display settings: text size and theme. Kept on this device only; they never touch the game. ---------- */
const Display = (() => {
  const KEY = 'bm-display', v = { ts: 'normal', theme: 'system' };
  try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); if (['normal', 'large', 'larger'].includes(s.ts)) v.ts = s.ts; if (['system', 'dark', 'light'].includes(s.theme)) v.theme = s.theme; } catch (e) {}
  const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: light)') : null;
  function apply(){
    const root = document.documentElement;
    if (v.ts === 'normal') delete root.dataset.ts; else root.dataset.ts = v.ts;
    root.dataset.theme = v.theme === 'light' || (v.theme === 'system' && mq && mq.matches) ? 'light' : 'dark';
    if (typeof Scene !== 'undefined' && Scene.themeChanged) Scene.themeChanged();
  }
  if (mq && mq.addEventListener) mq.addEventListener('change', apply);
  apply();
  return { get ts(){ return v.ts; }, get theme(){ return v.theme; }, set(k, x){ v[k] = x; try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} apply(); } };
})();
function displayScreen(back){
  const seg = (id, label, key, cur, items) => `<div class="lvl"><span id="${id}" class="eyebrow">${label}</span><div class="seg three" role="group" aria-labelledby="${id}">${items.map(([k, t]) => `<button type="button" data-${key}="${k}" aria-pressed="${k === cur}">${t}</button>`).join('')}</div></div>`;
  overlay(`<div class="eyebrow">This device</div><h2>Display and sound</h2><p class="dim">These are kept on this device only and do not change the game.</p>
    <div class="acct">
      ${seg('dsTs', 'Text size', 'ts', Display.ts, [['normal', 'Normal'], ['large', 'Large'], ['larger', 'Larger']])}
      ${seg('dsTh', 'Theme', 'th', Display.theme, [['system', 'Same as device'], ['dark', 'Dark'], ['light', 'Light']])}
      <div class="lvl"><label for="dsVol" class="eyebrow">Volume <output id="dsVolOut" for="dsVol">${Math.round(Snd.volume * 100)}%</output></label><input type="range" id="dsVol" min="0" max="100" step="5" value="${Math.round(Snd.volume * 100)}"></div>
      <button type="button" class="btn neutral" id="dsSnd" aria-pressed="${Snd.on}">${Snd.on ? 'Sound on' : 'Sound off'}</button>
      <button type="button" class="btn primary" id="dsBack">Back</button>
    </div>`);
  const press = (sel, x) => document.querySelectorAll(sel).forEach(b => b.setAttribute('aria-pressed', b === x));
  $('#ov').querySelector('[aria-labelledby="dsTs"]').onclick = e => { const b = e.target.closest('[data-ts]'); if (!b) return; Display.set('ts', b.dataset.ts); press('#ov [data-ts]', b); };
  $('#ov').querySelector('[aria-labelledby="dsTh"]').onclick = e => { const b = e.target.closest('[data-th]'); if (!b) return; Display.set('theme', b.dataset.th); press('#ov [data-th]', b); };
  $('#dsVol').oninput = e => { Snd.volume = e.target.value / 100; $('#dsVolOut').textContent = e.target.value + '%'; };
  $('#dsVol').onchange = () => { if (Snd.on) Snd.play('coin'); };
  $('#dsSnd').onclick = () => { Snd.toggle(); const b = $('#dsSnd'); b.textContent = Snd.on ? 'Sound on' : 'Sound off'; b.setAttribute('aria-pressed', Snd.on); sndBtn(); };
  $('#dsBack').onclick = back || closeOverlay;
}

const SPK = on => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" stroke="none"/>${on ? '<path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>' : '<path d="M17 9l5 6M22 9l-5 6"/>'}</svg>`;
function sndBtn(){ const row = $('#sndRow'); if (row) row.textContent = Snd.on ? 'Sound on' : 'Sound off'; const b = $('#sndBtn'); if (!b) return; b.innerHTML = SPK(Snd.on); b.setAttribute('aria-pressed', Snd.on); b.setAttribute('aria-label', Snd.on ? 'Sound on' : 'Sound off'); }
document.addEventListener('pointerdown', () => Snd.unlock(), { once:true });

let lastM = null, busy = false, view = 'counter', openKey = null, served = null, deskFor = null;
const AV = ['#d9ab4f','#71d49c','#9ec0ff','#ff9a8f','#c7a6ff','#7fd3d3','#e6d4a6'];
function avatar(name){ const w = name.replace(/^(Your|The)\s+/i, '').split(/\s+/); const ini = (w[0][0] + (w[1] ? w[1][0] : '')).toUpperCase(); let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return `<span class="avatar" style="background:${AV[h % AV.length]}" aria-hidden="true">${esc(ini)}</span>`; }
function unreadCount(){ return inboxActions().filter(c => !c.done).length + (S.inbox || []).filter(m => !m.read).length; }

function hud(flash){
  const m = metrics();
  $('#hWhen').textContent = `${MONTHS[Math.min(S.month, 11)].slice(0, 3)} ${S.year}`;
  const set = (id, txt, delta) => { const el = $(id); el.textContent = txt; if (flash && delta){ el.classList.remove('up', 'down'); void el.offsetWidth; el.classList.add(delta > 0 ? 'up' : 'down'); } };
  const d = lastM || m;
  const lvl = (id, warn, bad) => { const el = $(id); el.classList.toggle('warn', !!warn && !bad); el.classList.toggle('bad', !!bad); };
  set('#mProfit', fmt(m.profit, true), Math.abs(m.profit - d.profit) > 0.05 ? m.profit - d.profit : 0); lvl('#mProfit', false, m.profit < -0.5);
  set('#mCap', pc(m.cap), Math.abs(m.cap - d.cap) > 0.0005 ? m.cap - d.cap : 0); lvl('#mCap', m.cap < 0.125, m.cap < MIN_CAP);
  set('#mLiq', pc(m.liq, 0), Math.abs(m.liq - d.liq) > 0.002 ? m.liq - d.liq : 0); lvl('#mLiq', m.liq < 0.15, m.liq < MIN_LIQ);
  set('#mTrust', String(Math.round(m.trust)), Math.round(m.trust) - Math.round(d.trust)); lvl('#mTrust', m.trust < 45, m.trust < 25);
  const [rs, rc] = regStatus(); const r = $('#hReg'); r.innerHTML = '<span class="rl">Regulator </span>' + rs.toLowerCase(); r.className = 'reg ' + rc;
  const gb = $('#goalsBtn'); gb.hidden = !S.scenario; if (S.scenario){ const g = S.goals || []; gb.textContent = `Goals ${g.filter(x => x.ok !== false).length}/${g.length}`; }
  $('#hhBtn').hidden = !S.households;
  $('#policyBtn').hidden = !(S.progress && S.progress.unlocked.some(a => POLICY_LIMITS[a]));
  const nq = counterQueue().length, ni = inboxActions().filter(c => !c.done).length;        // the badge counts what needs a reply, not every unread message
  $('#nCounter').textContent = nq ? String(nq) : ''; $('#nInbox').textContent = ni ? String(ni) : '';
  $('#contBtn').textContent = S.over ? 'Year end' : (remaining() || served) ? 'Continue' : 'End month';
  lastM = m;
}
function floatText(t, good){ const f = document.createElement('div'); f.className = 'fl'; f.textContent = t; f.style.color = good ? 'var(--good)' : 'var(--bad)'; $('#float').appendChild(f); setTimeout(() => f.remove(), 1700); }
function ticker(){
  const tk = S.loans.filter(l => l.status === 'arrears').length;
  $('#ticker').textContent = `Bank Rate ${S.base.toFixed(2)}% · Inflation ${inflation().toFixed(1)}% · Unemployment ${unemp().toFixed(1)}% · House prices ${(hpiYr() * 100 >= 0 ? '+' : '')}${(hpiYr() * 100).toFixed(1)}% this year · Shares ${(S.mkt / S.mktY0 - 1 >= 0 ? '+' : '')}${pc(S.mkt / S.mktY0 - 1)} · ${S.wm ? `Client assets ${fmt(aum())} · ` : ''}${S.loans.length} new loans on book${tk ? ` · ${tk} in arrears` : ''}`;
}

function setView(v){
  view = v; $('#app').dataset.view = v;
  $('#tabCounter').setAttribute('aria-current', v === 'counter'); $('#tabInbox').setAttribute('aria-current', v === 'inbox');
  $('#pop').hidden = true;
  if (v === 'counter') renderCounter(); else renderInbox();
  hud(false);
}

/* ---------- The counter ---------- */
const SKIN_C = ['#f1c9a5','#d8a47f','#b07a52','#8a5a3c','#5c3b28','#e6b98f'], CLOTH_C = ['#3b62a8','#b84a5a','#2c8a5a','#d9ab4f','#6a4fa0','#2f7f8f','#8a5a3b','#c9c2b0','#444f63','#b86b3a','#7a2f3f','#55705a'], HAIR_C = ['#1a120c','#3b2a1a','#7a5a32','#b9b2a5','#111111'];
function fieldHTML(f){ return `<div class="f${f.w ? ' wide' : ''}"><dt>${termBtn(esc(f.l), f.t)}</dt><dd>${esc(f.v)}</dd></div>`; }
function docHTML(c, d, i){
  const ref = `No. ${c.ref}`;
  if (d.s === 'id'){
    const h = c.who.hue || 0.5, born = S.year - (c.who.age || 40);
    const photo = `<div class="photo" style="background:#a9bccd"><b style="background:${CLOTH_C[Math.floor(h * 997) % CLOTH_C.length]}"></b><i style="background:${SKIN_C[Math.floor(h * 131) % SKIN_C.length]}"></i><u style="background:${(c.who.age || 0) > 62 ? '#b9b2a5' : HAIR_C[Math.floor(h * 53) % HAIR_C.length]}"></u></div>`;
    return `<header class="dh">${esc(d.t)}<span>UK · ${String(c.ref).padStart(4, '0')}${String(c.id).padStart(5, '0')}</span></header><dl class="db">${photo}<div class="idf"><div class="f"><dt>Name</dt><dd>${esc(c.who.name)}</dd></div><div class="f"><dt>Born</dt><dd>${born}</dd></div>${d.rows.map(fieldHTML).join('')}</div></dl>`;
  }
  const who = i === 0 ? `<div class="who-row"><strong>${nameHTML(c)}${c.who.age ? ', ' + c.who.age : ''}</strong><span>${esc(c.who.sub)}</span></div>` : '';
  return `<header class="dh">${esc(d.t)}<span>${d.s === 'note' ? '' : ref}</span></header><dl class="db">${who}${d.rows.map(fieldHTML).join('')}</dl>`;
}
function idStrip(c, d){
  const h = c.who.hue || 0.5, born = S.year - (c.who.age || 40);
  const photo = `<div class="photo" style="background:#a9bccd"><b style="background:${CLOTH_C[Math.floor(h * 997) % CLOTH_C.length]}"></b><i style="background:${SKIN_C[Math.floor(h * 131) % SKIN_C.length]}"></i><u style="background:${(c.who.age || 0) > 62 ? '#b9b2a5' : HAIR_C[Math.floor(h * 53) % HAIR_C.length]}"></u></div>`;
  return `<div class="idstrip">${photo}<dl class="db"><div class="f"><dt>${esc(d.t)}</dt><dd>UK ${String(c.ref).padStart(4, '0')}${String(c.id).padStart(5, '0')}</dd></div><div class="f"><dt>Born</dt><dd>${born}</dd></div>${d.rows.map(fieldHTML).join('')}</dl></div>`;
}
function layDocs(c, mark){
  deskFor = c.id;
  const box = $('#docsIn'), docs = buildDocs(c);
  const idd = docs.find(d => d.s === 'id'), notes = docs.filter(d => d.s === 'note'), secs = docs.filter(d => d.s !== 'note' && d.s !== 'id');
  const note = d => `<div role="note" class="nline${d.coach ? ' coach' : ''}"><b>${esc(d.t)}</b>${d.rows.map(f => `<p>${d.coach ? '' : `<span class="nl">${termBtn(esc(f.l), f.t)}</span> `}${esc(f.v)}</p>`).join('')}</div>`;
  box.innerHTML = `<article class="sheet" id="mainDoc">
    <header class="sh-head"><span>${esc(c.label)}</span><span class="sh-ref">No. ${c.ref}</span></header>
    <div class="sh-who"><strong>${nameHTML(c)}${c.who.age ? ', ' + c.who.age : ''}</strong><span>${esc(c.who.sub)}</span></div>
    ${idd ? idStrip(c, idd) : ''}
    ${secs.map((d, i) => d.rows.length ? `<section class="sec">${i ? `<h2>${esc(d.t)}</h2>` : ''}<dl class="db">${d.rows.map(fieldHTML).join('')}</dl></section>` : '').join('')}
    ${notes.map(note).join('')}
    ${mark ? `<div class="mark still st-${mark.s}">${esc(mark.st)}</div>` : ''}
  </article>${(() => { const w = counterQueue().filter(x => x.id !== c.id).length, m = inboxActions().filter(x => !x.done).length; return w || m ? `<p class="qline">${w ? w + ' more waiting at the counter' : ''}${w && m ? ' · ' : ''}${m ? m + ' in your inbox need a reply' : ''}</p>` : ''; })()}`;
  box.style.height = '';
  $('#docs').scrollTop = 0;
}

function bubble(c, lines){
  const b = $('#bubble');
  if (!c){ b.hidden = true; return; }
  b.hidden = false;
  b.innerHTML = `<b>${esc(c.who.name)}${c.who.age ? `<span> · ${c.who.age}</span>` : ''}</b>${lines ? lines.map(l => `<p class="said">${esc(l.t)}</p>`).join('') : `<p>${esc(c.note)}</p>`}`;
}
function renderCounter(instant){
  ticker();
  const c = served ? served.c : counterQueue()[0];
  const tray = $('#tray'), box = $('#docsIn');
  if (!c){
    bubble(null); Scene.setView('hall', instant);
    const act = inboxActions().filter(x => !x.done).length;
    box.style.height = ''; box.innerHTML = `<div class="empty"><h2>Counter closed</h2><p>${act ? `No one waiting. ${act} message${act > 1 ? 's' : ''} in your inbox need${act > 1 ? '' : 's'} a reply.` : `No one waiting. ${MONTHS[S.month]}'s work is done.`}</p></div>`;
    tray.innerHTML = `<button type="button" class="btn primary served" id="deskCont">${act ? 'Go to inbox' : `Close the books for ${MONTHS[S.month]}`}</button>`;
    $('#deskCont').onclick = cont; return;
  }
  Scene.setView('booth', instant);
  if (served){
    if (deskFor !== c.id) layDocs(c, served.o); bubble(c, served.out.lines.slice(0, 2));
    const chips = served.out.chips.map(ch => `<span class="chip ${ch.c}">${esc(ch.t)}</span>`).join('');
    const more = served.out.lines.slice(2, 3).map(l => `<p class="more-line">${esc(l.t)}</p>`).join('');
    const left = counterQueue().length;
    const cbox = served.out.cust ? `<div class="cust"><b>For the customer</b>${esc(served.out.cust)}</div>` : '';
    tray.innerHTML = `<div class="served">${cbox}${more}${chips ? `<div class="chips">${chips}</div>` : ''}<button type="button" class="btn primary" id="nextBtn">${left ? `Next customer · ${left} waiting` : 'Counter closed'}</button></div>`;
    $('#nextBtn').onclick = nextCustomer; return;
  }
  busy = false;
  layDocs(c); bubble(c);
  tray.innerHTML = c.opts.map((o, i) => { const ok = optionAllowed(o); return `<button type="button" class="act ${o.s}" data-i="${i}" ${ok ? '' : 'disabled'}>${esc(o.l)}${o.sub || !ok ? `<small>${ok ? esc(o.sub) : esc(o.why || 'Not enough cash')}</small>` : ''}</button>`; }).join('');
  tray.onclick = e => { const b = e.target.closest('.act'); if (b && !b.disabled) stampIt(c, +b.dataset.i); };
}
function stampIt(c, i){
  if (busy) return; busy = true;
  const o = c.opts[i], before = metrics();
  const out = dispatch({ type:"resolve", id:c.id, k:o.k });
  Snd.unlock();
  $('#docs').scrollTop = 0;
  const md = $('#mainDoc'); if (md){ const pr = document.createElement('div'); pr.className = 'press'; md.appendChild(pr); setTimeout(() => pr.remove(), 700); const mk = document.createElement('div'); mk.className = 'mark st-' + o.s; mk.style.animationDelay = reduce ? '0s' : '.25s'; mk.textContent = o.st || 'DONE'; md.appendChild(mk); }
  Snd.play('stamp', reduce ? 0 : 250); try { navigator.vibrate && navigator.vibrate(14); } catch (e) {}
  const dp = metrics().profit - before.profit;
  Scene.react(c, o.s, dp); Scene.sync(); if (c.kind.startsWith('wm')) Scene.boards();
  if (Math.abs(dp) >= 0.05) floatText(fmt(dp, true), dp > 0);
  if (dp >= 0.5) Snd.play('coin', 520); else if (o.s === 'no') Snd.play('bad', 650);
  served = { c, o, out };
  hud(true); save();
  setTimeout(() => { busy = false; if (served && served.c === c && view === 'counter') renderCounter(); }, reduce ? 50 : 650);
}
function nextCustomer(){ served = null; busy = false; if (counterQueue().length){ Snd.play('bell'); Snd.play('paper', 280); } Scene.setCard(); renderCounter(); hud(false); save(); }

/* ---------- The inbox ---------- */
function mailList(){
  const acts = inboxActions(), open = acts.filter(c => !c.done), done = acts.filter(c => c.done);
  const toItem = c => ({ key:'c' + c.id, from: fromOf(c), subject: subjOf(c), when:`${dayOf(c.id)} ${MONTHS[S.month].slice(0, 3)}`, req: !c.done, read: !!(c.read || c.done), card:c });
  const mails = (S.inbox || []).slice().reverse().map(m => ({ key:'m' + m.id, from:m.from, subject:m.subject, when:m.when.replace(/ \d{4}$/, ''), req:false, read:m.read, mail:m, tone:m.tone }));
  return [...open.map(toItem), ...done.map(toItem), ...mails];
}
function renderInbox(){
  const items = mailList();
  const nReq = items.filter(x => x.req).length;
  $('#mlist').innerHTML = `<div class="mhead-bar"><h2>Inbox</h2><span>${nReq ? `${nReq} need a reply` : 'All replied'}</span></div>` + (items.length ? items.map(x => `<button type="button" class="mrow${x.read ? '' : ' unread'}${x.req ? ' req' : ''}${x.key === openKey ? ' on' : ''}" data-k="${x.key}">${avatar(x.from)}<span style="min-width:0"><span class="mfrom">${!x.read ? '<i class="dot"></i>' : ''}${esc(x.from)}</span><span class="msub">${esc(x.subject)}</span>${x.req ? '<span class="tag">Response required</span>' : x.card ? '<span class="tag done">Replied</span>' : ''}</span><span class="mwhen">${esc(x.when)}</span></button>`).join('') : '<p style="padding:16px;color:var(--muted)">No messages yet.</p>');
  $('#mlist').onclick = e => { const r = e.target.closest('.mrow'); if (r) openMsg(r.dataset.k); };
  if (!openKey && matchMedia('(min-width:880px)').matches && items.length) openKey = items[0].key;
  if (openKey && items.some(x => x.key === openKey)) renderMsg(items.find(x => x.key === openKey)); else { openKey = null; $('#app').dataset.msg = ''; $('#mview').innerHTML = ''; }
}
function openMsg(k){
  openKey = k; if (view !== 'inbox'){ view = 'inbox'; $('#app').dataset.view = 'inbox'; $('#tabCounter').setAttribute('aria-current', false); $('#tabInbox').setAttribute('aria-current', true); }
  const it = mailList().find(x => x.key === k); if (!it) return;
  dispatch({ type:'read', key:it.key }); Snd.play('paper');
  renderInbox(); $('#app').dataset.msg = '1'; $('#mview').scrollTop = 0; hud(false); save();
}
function renderMsg(it){
  const c = it.card, m = it.mail;
  const cust = c && c.who.age ? `<p class="mcust">Customer: ${esc(c.who.name)}, ${c.who.age} · ${esc(c.who.sub)}</p>` : '';
  const fields = c && c.fields.length ? `<dl class="mfields">${c.fields.map(f => `<div class="${f.w ? 'wide' : ''}"><dt>${termBtn(esc(f.l), f.t)}</dt><dd>${esc(f.v)}</dd></div>`).join('')}</dl>` : '';
  let tail = '';
  if (c && !c.done){
    tail = `<h3>Your reply</h3><div class="replies" id="replies">${c.opts.map((o, i) => { const ok = optionAllowed(o); return `<button type="button" class="btn ${o.s}" data-i="${i}" ${ok ? '' : 'disabled'}>${esc(o.l)}${o.sub || !ok ? `<small>${ok ? esc(o.sub) : esc(o.why || 'Not enough cash')}</small>` : ''}</button>`; }).join('')}</div>`;
  } else if (c && c.done){
    const o = c.opts.find(x => x.k === c.done), out = c.out || { lines:[], chips:[] };
    const nxt = inboxActions().find(x => !x.done);
    tail = `<div class="reply"><b>You replied: ${esc(o ? o.l : 'Done')}</b>${out.lines.map(l => `<p>${esc(l.t)}</p>`).join('')}${out.cust ? `<div class="cust"><b>For the customer</b>${esc(out.cust)}</div>` : ''}${out.chips.length ? `<div class="chips">${out.chips.map(ch => `<span class="chip ${ch.c}">${esc(ch.t)}</span>`).join('')}</div>` : ''}</div>
      <button type="button" class="btn ${nxt ? 'primary' : 'neutral'}" id="msgNext">${nxt ? 'Next message needing a reply' : counterQueue().length ? 'Back to the counter' : 'Back to inbox'}</button>`;
  } else if (m && m.reply){
    tail = `<div class="reply"><b>You replied: ${esc(m.reply.label)}</b>${m.reply.lines.map(t => `<p>${esc(t)}</p>`).join('')}</div>`;
  }
  const body = c ? c.note : m.body;
  $('#mview').innerHTML = `<article class="msg"><button type="button" class="back" id="msgBack">‹ Inbox</button>
    <div class="mmeta">${avatar(it.from)}<div><strong>${esc(it.from)}</strong><br>To: you · ${esc(it.when)} ${S.year}</div></div>
    <h2>${esc(it.subject)}</h2>${cust}<p>${esc(body)}</p>${fields}${c && c.coach && !c.done ? `<div class="coach"><b>Your trainer</b>${esc(c.coach)}</div>` : ''}${tail}</article>`;
  $('#msgBack').onclick = () => { openKey = null; $('#app').dataset.msg = ''; renderInbox(); };
  const rp = $('#replies'); if (rp) rp.onclick = e => { const b = e.target.closest('.btn'); if (b && !b.disabled) replyMsg(c, +b.dataset.i); };
  const nx = $('#msgNext'); if (nx) nx.onclick = () => { const n = inboxActions().find(x => !x.done); if (n) openMsg('c' + n.id); else if (counterQueue().length) setView('counter'); else { openKey = null; $('#app').dataset.msg = ''; renderInbox(); } };
}
function replyMsg(c, i){
  if (busy) return; busy = true;
  const o = c.opts[i], before = metrics().profit;
  dispatch({ type:"resolve", id:c.id, k:o.k }); Snd.play('click'); const dp = metrics().profit - before; if (dp >= 0.5) Snd.play('coin', 120); else if (dp <= -0.5) Snd.play('bad', 120);
  Scene.sync(); Scene.setCard(); if (c.kind.startsWith('wm') || c.kind === 'rate') Scene.boards();
  hud(true); save(); busy = false;
  renderInbox();
}

/* ---------- Continue ---------- */
function cont(){
  if (S.over){ endScreen(); return; }
  if (served){ nextCustomer(); if (view === 'counter') return; }
  const waiting = counterQueue().length, act = inboxActions().find(c => !c.done);
  if (view === 'counter' && waiting){ renderCounter(); const t = $('#tray'); t.classList.remove('shake'); void t.offsetWidth; t.classList.add('shake'); return; }
  if (act){ openMsg('c' + act.id); return; }
  if (waiting){ setView('counter'); return; }
  closeBooks();
}
function closeBooks(){
  const prevMonth = S.month, prevYear = S.year;
  const rep = dispatch({ type:"closeMonth" });
  served = null; openKey = null; $('#app').dataset.msg = '';
  Scene.sync(); Scene.monthTurn(); Scene.setCard(); hud(true); save();
  Snd.play('vault'); Snd.play(rep.profit >= 0 ? 'coin' : 'bad', 700); Snd.play('mail', 1300);
  const L = rep.pl, rows = plRows(L), mm = monthMoves(rep);
  const m = metrics();
  const nii = L.intLoans + L.intGilts + L.intRes + L.intDep + L.intCB, inc = nii + L.fees + (L.wealth || 0);
  const kpi = { nim: nii * 12 / assets(), ci: inc > 0 ? -L.costs / inc : -1, cor: -L.losses * 12 / Math.max(1, S.legacy + loanSum()) };
  const nNew = rep.events.length + (rep.next ? 1 : 0), bad = rep.events.filter(e => e.tone === 'bad').length;
  overlay(`<div class="eyebrow">Month ${prevMonth + 1} of 12 · ${prevYear}</div><h2>${MONTHS[prevMonth]} accounts</h2>
    <div><div class="big" style="color:${rep.profit >= 0 ? 'var(--good)' : 'var(--bad)'}">${fmt(rep.profit, true)}</div><div style="color:var(--muted);font-size:calc(13px*var(--ts))">Profit this month · ${fmt(m.profit, true)} for the year</div></div>
    <div class="grid2"><div class="stat"><span>Capital ratio</span><b style="color:${m.cap < MIN_CAP ? 'var(--bad)' : 'var(--text)'}">${pc(m.cap)}</b></div><div class="stat"><span>Liquidity</span><b style="color:${m.liq < MIN_LIQ ? 'var(--bad)' : 'var(--text)'}">${pc(m.liq, 0)}</b></div><div class="stat"><span>Customers</span><b>${Math.round(m.trust)}/100</b></div><div class="stat"><span>Regulator</span><b>${regStatus()[0]}</b></div></div>
    ${mm.moves.length ? `<div class="moves" aria-label="What moved this month">${mm.moves.map(v => `<span class="mv ${v.good ? 'good' : 'bad'}"><span aria-hidden="true">${v.up ? '▲' : '▼'}</span> ${esc(v.label)} ${esc(v.text)}</span>`).join('')}</div>` : ''}
    ${mm.drivers.length ? `<ul class="drivers" aria-label="Biggest items this month">${mm.drivers.map(d => `<li><span>${esc(d.label)}</span><b class="num" style="color:${d.amt < 0 ? 'var(--bad)' : 'var(--good)'}">${fmt(d.amt, true)}</b></li>`).join('')}</ul>` : ''}
    <p style="color:var(--muted);font-size:calc(14px*var(--ts))">${nNew} new message${nNew === 1 ? '' : 's'} in your inbox${bad ? `, ${bad} with bad news` : ''}.</p>
    <details class="more"><summary>Full accounts</summary>
      <table class="ledger">${rows.map(r => `<tr><td>${r[0]}</td><td style="color:${r[1] < 0 ? 'var(--bad)' : 'var(--text)'}">${fmt(r[1], true)}</td></tr>`).join('')}<tr class="tot"><td>Profit</td><td>${fmt(rep.profit, true)}</td></tr></table>
      <div class="grid3"><div class="stat"><span>${termBtn('Margin', 'Net interest margin')}</span><b>${pc(kpi.nim, 2)}</b></div><div class="stat"><span>${termBtn('Cost/income', 'Cost/income')}</span><b style="color:${kpi.ci > 0.8 || kpi.ci < 0 ? 'var(--bad)' : 'var(--text)'}">${kpi.ci < 0 ? 'n/a' : pc(kpi.ci, 0)}</b></div><div class="stat"><span>${termBtn('Cost of risk', 'Cost of risk')}</span><b>${pc(kpi.cor, 2)}</b></div></div>
    </details>
    <button type="button" class="btn primary" id="ovGo">${S.over ? 'Read The Fiscal Herald' : `Open ${MONTHS[S.month]}`}</button>`);
  $('#ovGo').onclick = () => { if (S.over) herald(); else { closeOverlay(); Scene.boards(); setView('inbox'); } };
}

/* ---------- The Fiscal Herald ---------- */
function herald(){
  const stories = heraldStories(), lead = stories[0], subs = stories.slice(1, 4), brief = stories.slice(4, 8);
  const dt = new Date(S.year, 11, 31), day = dt.toLocaleDateString('en-GB', { weekday:'long' });
  const b0 = S.history.length ? S.y0.base : S.base, h0 = S.history[0];
  const photo = Scene.snapshot();
  const rateLine = P().abs ? P().rate[0] : S.y0.base;
  overlay(`<div class="mast"><h1>The Fiscal Herald</h1><div class="rule"><span>${day} 31 December ${S.year}</span><span>Hartley Green edition</span><span>£3.50</span></div></div>
    <article class="lead"><h2>${esc(lead.head)}</h2><p class="stand">${esc(lead.body)}</p></article>
    ${photo ? `<figure class="photo-np"><img src="${photo}" alt="The banking hall at Counting House"><figcaption>The banking hall at Counting House on the high street.</figcaption></figure>` : ''}
    <div class="np-cols">
      ${subs.map(x => `<section class="np-story"><h3>${esc(x.head)}</h3>${x.body ? `<p>${esc(x.body)}</p>` : ''}</section>`).join('')}
      <section class="np-box"><h3>Markets</h3><table>
        <tr><td>Bank Rate</td><td>${rateLine.toFixed(2)}% → ${S.base.toFixed(2)}%</td></tr>
        <tr><td>Unemployment</td><td>${unemp(11).toFixed(1)}%</td></tr>
        <tr><td>House prices</td><td>${(hpiYr(11) * 100 >= 0 ? '+' : '')}${(hpiYr(11) * 100).toFixed(1)}%</td></tr>
        <tr><td>Shares</td><td>${(S.mkt / S.mktY0 - 1 >= 0 ? '+' : '')}${pc(S.mkt / S.mktY0 - 1)}</td></tr>
        <tr><td>Best easy-access saver</td><td>${mkt().toFixed(2)}%</td></tr>
        <tr><td>Inflation</td><td>${inflation(11).toFixed(1)}%</td></tr>
        <tr><td>Real return on savings</td><td>${(mkt() - inflation(11) >= 0 ? '+' : '')}${(mkt() - inflation(11)).toFixed(1)}%</td></tr></table></section>
      ${brief.length ? `<section class="np-box"><h3>In brief</h3><ul class="np-brief">${brief.map(x => `<li>${esc(x.head)}</li>`).join('')}</ul></section>` : ''}
    </div>
    <button type="button" class="btn primary" id="ovGo">${S.scenario ? 'See how you did' : 'See your year-end rating'}</button>`);
  $('#ov .panel').classList.add('paper');
  $('#ovGo').onclick = endScreen;
  Snd.play('paper');
}

/* ---------- Branch ---------- */
function bankTop(which){ const rv = rivalsLive(), n = 2 + (S.amb ? 1 : 0) + (rv ? 1 : 0); return `<div class="seg${n === 3 ? ' three' : n === 4 ? ' four' : ''}" role="group" aria-label="Section"><button type="button" data-seg="books" aria-pressed="${which === 'books'}">Books</button><button type="button" data-seg="branch" aria-pressed="${which === 'branch'}">Branch</button>${S.amb ? `<button type="button" data-seg="goals" aria-pressed="${which === 'goals'}">Goals</button>` : ''}${rv ? `<button type="button" data-seg="rivals" aria-pressed="${which === 'rivals'}">Rivals</button>` : ''}</div>`; }
function bankWire(){ const sg = $('#ov .seg'); if (sg) sg.onclick = e => { const b = e.target.closest('[data-seg]'); if (!b) return; b.dataset.seg === 'branch' ? branchPanel() : b.dataset.seg === 'goals' ? goalsPanel() : b.dataset.seg === 'rivals' ? rivalsPanel() : booksPanel(); }; const sr = $('#sndRow'); if (sr){ sr.onclick = () => { Snd.toggle(); sndBtn(); if (Snd.on) Snd.play('click'); }; sndBtn(); } }
const bankFoot = () => `<div class="rowbtn two stickyfoot"><button type="button" class="btn neutral" id="sndRow">Sound</button><button type="button" class="btn primary" id="ovGo">Back</button></div>`;
function branchPanel(msg){
  const mo = upMonthly();
  overlay(`${bankTop('branch')}<div class="eyebrow">${MONTHS[Math.min(S.month, 11)]} ${S.year} · cash ${fmt(S.cash)}</div><h2>Your branch</h2>
    <p style="color:var(--muted);font-size:calc(14px*var(--ts))">Spend money now to earn more later. One-off costs hit this month's profit; monthly costs go on your running costs.</p>
    ${msg ? `<div class="coach" style="border-left-color:var(--good);background:rgba(113,212,156,.08)"><b style="color:var(--good)">Done</b>${msg}</div>` : ''}
    <div class="ups">${UPGRADES.map(u => { const own = owned(u.key), can = S.cash >= u.cost && !S.over; return `<div class="upg${own ? ' own' : ''}"><b>${esc(u.name)}</b><p>${esc(u.blurb)}</p><span class="eff">${esc(u.effect)}</span><span class="price">${u.cost ? fmt(u.cost) + ' once' : 'No set-up cost'}${u.monthly ? ` · ${u.monthly > 0 ? fmt(u.monthly) + '/month' : 'saves ' + fmt(-u.monthly) + '/month'}` : ''}</span><button type="button" class="btn ${own ? 'neutral' : 'go'}" data-up="${u.key}" ${own || !can ? 'disabled' : ''}>${own ? 'Owned' : can ? 'Buy' : 'Can\'t afford'}</button></div>`; }).join('')}</div>
    <table class="ledger"><tr><td>Monthly cost of upgrades</td><td>${mo >= 0 ? fmt(mo) : '−' + fmt(-mo)}</td></tr><tr><td>Counters open</td><td>${owned('cashier') ? 2 : 1}</td></tr></table>
    ${bankFoot()}`);
  $('#ovGo').onclick = closeOverlay; bankWire(); tabSel('bank');
  $('#ov .ups').onclick = e => { const b = e.target.closest('[data-up]'); if (!b || b.disabled) return; const out = dispatch({ type:"buy", key:b.dataset.up }); if (!out) return; Snd.play('stamp'); Snd.play('coin', 200); Scene.sync(); hud(true); save(); branchPanel(`${UPGRADES.find(u => u.key === b.dataset.up).name} bought.`); };
}
