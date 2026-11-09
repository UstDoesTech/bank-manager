/* ---------- Recording games on the server (optional) ----------
   Served from the game server and signed in, every game is also recorded there: the page plays on its own engine
   as always, and each command is sent in order. The server re-runs the commands itself. Offline or signed out,
   nothing changes. Unsent commands are kept in localStorage and flushed when the connection or session returns. */
const Remote = (() => {
  const KEY = 'bm-remote';
  let me = null, rec = null, chain = Promise.resolve();
  const available = () => /^https?:/.test(location.protocol);
  const store = () => { try { rec ? localStorage.setItem(KEY, JSON.stringify(rec)) : localStorage.removeItem(KEY); } catch (e) {} };
  async function api(method, url, body){
    const r = await fetch(url, { method, credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    let json = null; try { json = await r.json(); } catch (e) {}
    return { ok: r.ok, status: r.status, json: json || {} };
  }
  async function init(){
    if (!available()) return;
    try { me = (await api('GET', '/api/me')).json; if (!me.signedIn) me = null; } catch (e) { me = null; }
    try { rec = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { rec = null; }
    flush();
  }
  const ready = () => !!(me && me.signedIn && me.consented);
  async function create(opts){
    try { const r = await api('POST', '/api/games', opts); if (!r.ok) return null; rec = { id: r.json.id, seq: 1, pending: [] }; store(); return r.json; }
    catch (e) { return null; }
  }
  function drop(){ rec = null; store(); }
  // Called after every command the page's own engine accepts.
  function record(cmd, out){
    if (!rec || cmd.type === 'newGame' || cmd.type === 'read') return;       // reading mail changes no money, so it is not sent
    if ((cmd.type === 'resolve' || cmd.type === 'buy') && !out) return;      // the engine refused it
    const c = { type: cmd.type }; if (cmd.type === 'resolve'){ c.id = cmd.id; c.k = cmd.k; } if (cmd.type === 'buy') c.key = cmd.key;
    if (cmd.type === 'setPolicy'){ c.area = cmd.area; if (cmd.release) c.release = true; else c.values = cmd.values; }
    if (cmd.type === 'stress'){ if (cmd.overrides) c.overrides = cmd.overrides; if (cmd.scenario && cmd.scenario !== 'recession') c.scenario = cmd.scenario; }
    rec.pending.push(c); store(); flush();
  }
  function flush(){
    chain = chain.then(async () => {
      while (rec && me && rec.pending.length){
        let r; try { r = await api('POST', '/api/games/' + rec.id + '/commands', { seq: rec.seq + 1, command: rec.pending[0] }); } catch (e) { return; }   // offline: try again later
        if (r.ok){ rec.seq++; rec.pending.shift(); store(); continue; }
        if (r.status === 401){ me = null; return; }                                                       // session ended: keep the queue
        if (r.json.error === 'out_of_sequence' && r.json.expected === rec.seq + 2){ rec.seq++; rec.pending.shift(); store(); continue; }   // the reply was lost but the command landed
        console.warn('Recording stopped:', r.json.error || r.status); drop(); return;
      }
    });
  }
  const who = () => me && (me.email || 'a guest');
  // Anonymous recording: a game started without an account is recorded under a random key (no email). There is no way to switch recording off.
  async function guest(){
    if (!available() || me) return;
    try { const r = await api('POST', '/api/guest', {}); if (!r.ok) return; me = (await api('GET', '/api/me')).json; if (!me.signedIn) me = null; } catch (e) { me = null; }
  }
  return { pendingCount: () => (rec ? rec.pending.length : 0), guest, available, init, ready, create, drop, record, flush, api, me: () => me, setMe: (m) => { me = m && m.signedIn ? m : null; }, who, recording: () => !!rec, settled: () => chain, gameId: () => rec && rec.id };
})();
{ const engineDispatch = dispatch; dispatch = function(cmd){ const out = engineDispatch(cmd); Remote.record(cmd, out); return out; }; }

/* Financial literacy check: five questions before the first recorded game and one more after each year played.
   Optional, and only for signed-in players who have accepted the notice. The server holds the answers and does the scoring. */
async function literacyCheck(only){
  const m = Remote.me();
  if (!Remote.ready() || !m || !m.consented || m.guest) return;
  let st; try { const r = await Remote.api('GET', '/api/literacy'); if (!r.ok) return; st = r.json; } catch (e) { return; }
  if (!st.due || (only && st.phase !== only)) return;
  await new Promise(done => {
    const qs = st.questions.map((q, i) => '<fieldset class="lq"><legend>' + (i + 1) + '. ' + esc(q.text) + '</legend>' + q.options.map(o => '<label class="chk"><input type="radio" name="lq_' + q.id + '" value="' + o.k + '"> ' + esc(o.t) + '</label>').join('') + '</fieldset>').join('');
    overlay('<div class="eyebrow">' + (st.phase === 'before' ? 'Before you start' : 'After year ' + st.yearsPlayed) + ' · optional</div><h2>Five quick questions</h2><p class="dim">Not part of the game. They help show whether playing teaches anything. Answers are kept without your name or email. "Not sure" is a fine answer.</p><div class="acct" id="lqForm">' + qs + '<div class="msg" id="lqMsg" role="status"></div><button type="button" class="btn primary" id="lqGo">Submit</button><button type="button" class="btn link" id="lqSkip">Skip for now</button></div>');
    $('#lqSkip').onclick = () => { closeOverlay(); done(); };
    $('#lqGo').onclick = async () => {
      const answers = {}; for (const q of st.questions){ const c = document.querySelector('input[name="lq_' + q.id + '"]:checked'); if (!c){ $('#lqMsg').textContent = 'Please answer every question, or skip.'; return; } answers[q.id] = c.value; }
      $('#lqGo').disabled = true;
      const r = await Remote.api('POST', '/api/literacy', { answers, gameId: Remote.gameId() || undefined });
      if (!r.ok){ $('#lqMsg').textContent = (r.json && r.json.message) || 'Could not save that. You can skip.'; $('#lqGo').disabled = false; return; }
      overlay('<div class="eyebrow">Thank you</div><h2>You got ' + r.json.score + ' of 5</h2>' + r.json.results.map(x => '<div class="note"><div class="eyebrow">' + esc(x.concept) + ' · ' + (x.correct ? 'right' : 'not quite') + '</div><p>' + esc(x.why) + '</p></div>').join('') + '<div class="rowbtn"><button type="button" class="btn primary" id="lqDone">Continue</button></div>');
      $('#lqDone').onclick = () => { closeOverlay(); done(); };
    };
  });
}
async function offerLiteracy(){
  const m = Remote.me(); if (!Remote.ready() || !m || !m.consented || m.guest || S.scenario || S.over !== 'done') return;
  await Remote.settled();                                    // the year's last command must reach the server first
  let st; try { const r = await Remote.api('GET', '/api/literacy'); if (!r.ok || !r.json.due) return; st = r.json; } catch (e) { return; }
  const row = document.querySelector('#ov .rowbtn'); if (!row || document.getElementById('ovLit')) return;
  const b = document.createElement('button'); b.type = 'button'; b.className = 'btn neutral'; b.id = 'ovLit'; b.textContent = 'Five quick questions (optional)';
  b.onclick = async () => { await literacyCheck(); endScreen(); };
  row.insertBefore(b, row.firstChild);
}

async function startGame(opts = {}){
  if (!opts.tutorial && !opts.scenario && opts.households === undefined) opts = Object.assign({}, opts, { households: true, meetings: true, rivals: true });
  clearSave(); Remote.drop(); acknowledgeCookie();
  let seed = null;
  await Remote.guest();
  if (Remote.ready()){ await literacyCheck('before'); const g = await Remote.create(opts); if (g) seed = g.seed; }
  dispatch({ type:'newGame', seed, opts }); save(); play();
}

function accountScreen(msg, isErr){
  const m = Remote.me(), note = (t, err) => `<div class="msg${err ? ' err' : ''}" role="status">${esc(t || '')}</div>`;
  const back = '<button type="button" class="btn link" id="acBack">Back</button>';
  if (m && !m.guest){
    overlay(`<div class="eyebrow">Signed in</div><h2>${esc(Remote.who())}</h2>
      <div class="acct">${note(msg, isErr)}
      <button type="button" class="btn neutral" id="acOut">Sign out</button>
      <details class="more"><summary>Delete my account</summary><div class="acct" style="margin-top:8px"><label>Password<input type="password" id="acDelPw" autocomplete="current-password"></label>
      <button type="button" class="btn no" id="acDel">Delete my account</button></div></details>${back}</div>`);
    $('#acOut').onclick = async () => { await Remote.api('POST', '/api/logout', {}); Remote.setMe(null); accountScreen('Signed out.'); };
    $('#acDel').onclick = async () => { const r = await Remote.api('DELETE', '/api/me', { password: $('#acDelPw').value }); if (r.ok){ Remote.setMe(null); Remote.drop(); accountScreen('Your account is deleted.'); } else accountScreen(r.json.message, true); };
    $('#acBack').onclick = titleScreen; return;
  }
  overlay(`<div class="eyebrow">Account</div><h2>Save your games</h2>
    ${m && m.guest ? `<p>Sign in or create an account to keep your games under your own login.</p>` : '<p>Sign in to keep your games under your own login.</p>'}
    <form class="acct" id="acForm" novalidate>
      <label>Email<input type="email" id="acEmail" autocomplete="username" required></label>
      <label>Password<input type="password" id="acPw" autocomplete="current-password" minlength="10" required></label>
      ${note(msg, isErr)}
      <button type="submit" class="btn primary" id="acIn">Sign in</button>
      <button type="button" class="btn neutral" id="acReg">Create account</button>
      <button type="button" class="btn link" id="acForgot">Forgot password</button>${back}
    </form>`);
  const creds = () => ({ email: $('#acEmail').value.trim(), password: $('#acPw').value });
  $('#acForm').onsubmit = async (e) => { e.preventDefault(); const r = await Remote.api('POST', '/api/login', creds());
    if (!r.ok) return accountScreen(r.json.message || 'Could not sign in.', true);
    Remote.setMe((await Remote.api('GET', '/api/me')).json); await Remote.init(); accountScreen(); };
  $('#acReg').onclick = async () => { const r = await Remote.api('POST', '/api/register', creds()); if (r.ok && m && m.guest){ try { Remote.setMe((await Remote.api('GET', '/api/me')).json); } catch (e) {} } accountScreen(r.ok ? r.json.message : r.json.message || 'Could not register.', !r.ok); };
  $('#acForgot').onclick = async () => { const r = await Remote.api('POST', '/api/forgot', { email: $('#acEmail').value.trim() }); accountScreen(r.json.message || 'Enter your email address first.', !r.ok); };
  $('#acBack').onclick = titleScreen;
}
function resetScreen(token){
  overlay(`<div class="eyebrow">Account</div><h2>Choose a new password</h2>
    <form class="acct" id="rsForm"><label>New password (10 or more characters)<input type="password" id="rsPw" autocomplete="new-password" minlength="10" required></label><div class="msg" id="rsMsg" role="status"></div>
    <button type="submit" class="btn primary">Save password</button></form>`);
  $('#rsForm').onsubmit = async (e) => { e.preventDefault(); const r = await Remote.api('POST', '/api/reset', { token, password: $('#rsPw').value });
    history.replaceState(null, '', location.pathname); if (r.ok) accountScreen('Password changed. Sign in with it.'); else $('#rsMsg').textContent = r.json.message || 'That did not work.'; };
}

/* The game menu: pause, save, sound, account, exit to the title screen and sign out. Opening it pauses the scene. */
let menuConfirm = false;
function menuScreen(msg, isErr){
  if (!S) return;
  const m = Remote.me(), guest = !!(m && m.guest), signedIn = !!(m && !m.guest), recording = Remote.recording();
  const status = !Remote.available() ? 'Your game saves itself on this device after every move.'
    : signedIn ? `Signed in as ${esc(m.email)}.`
    : guest ? 'Playing as a guest.'
    : 'Your game saves itself on this device after every move.';
  overlay(`<div class="eyebrow">Paused</div><h2>Menu</h2><p class="dim">${status}</p>
    <div class="msg${isErr ? ' err' : ''}" role="status">${esc(msg || '')}</div>
    <div class="acct">
      <button type="button" class="btn primary" id="menuResume">Resume</button>
      <button type="button" class="btn neutral" id="menuSave">Save game</button>
      <button type="button" class="btn neutral" id="menuSound">${Snd.on ? 'Sound on' : 'Sound off'}</button>
      ${Remote.available() ? '<button type="button" class="btn neutral" id="menuAcct">Account and recording</button>' : ''}
      <button type="button" class="btn neutral" id="menuExit">Save and exit to the title screen</button>
      ${signedIn ? `<button type="button" class="btn ${menuConfirm ? 'no' : 'link'}" id="menuOut">${menuConfirm ? 'Tap again to sign out' : 'Sign out'}</button>` : ''}
    </div>`);
  Scene.setPaused(true);
  $('#menuResume').onclick = closeOverlay;
  $('#menuSave').onclick = () => { save(); Remote.flush(); const q = Remote.pendingCount(); menuScreen(q ? `Saved on this device. ${q} move${q === 1 ? '' : 's'} still to send to the server, and they will go when you are online.` : 'Saved' + (recording ? ' on this device and on the server.' : ' on this device.')); };
  $('#menuSound').onclick = () => { Snd.toggle(); menuScreen(); };
  const ac = $('#menuAcct'); if (ac) ac.onclick = () => accountScreen();
  $('#menuExit').onclick = () => { save(); Remote.flush(); S = null; menuConfirm = false; Scene.setView('hall', true); titleScreen(); };
  const out = $('#menuOut'); if (out) out.onclick = async () => {
    if (!menuConfirm){ menuConfirm = true; menuScreen(); return; }
    menuConfirm = false; save();
    try { await Remote.api('POST', '/api/logout', {}); } catch (e) { return menuScreen('Could not reach the server to sign out. Try again when you are online.', true); }
    Remote.setMe(null); Remote.drop(); menuScreen('Signed out. Your game stays saved on this device.');
  };
}
$('#menuBtn').onclick = () => { if (S && $('#ov').hidden) { Snd.play('click'); menuConfirm = false; menuScreen(); } };
/* The only notice: the cookie that records game sessions. Shown once on a first visit when there is a server, and gone for good when dismissed or when a game starts. */
function cookieNote(){
  const el = $('#cookieNote'); if (!el) return;
  let ok = false; try { ok = localStorage.getItem('bm-cookie') === '1'; } catch (e) {}
  el.hidden = ok || !Remote.available();
}
function acknowledgeCookie(){ try { localStorage.setItem('bm-cookie', '1'); } catch (e) {} const el = $('#cookieNote'); if (el) el.hidden = true; }
$('#cookieOk').onclick = acknowledgeCookie;
function titleScreen(){
  const saved = load(), resumable = saved && (!saved.over || saved.over === 'done');
  let best = null; try { best = JSON.parse(localStorage.getItem('ch-best') || 'null'); } catch (e) {}
  let level = 'standard'; try { const v = localStorage.getItem('bm-level'); if (DIFFICULTY[v]) level = v; } catch (e) {}
  overlay(`<p class="title-xl">Bank<br>Manager</p>
    <p>Run a small high-street bank. Serve customers, answer your inbox, and make money without failing your customers or the regulator.</p>
    ${best ? `<p class="num" style="color:var(--brass);font-size:13px;margin:0">Best rating so far: ${esc(best.letter)}${best.level && best.level !== 'standard' && DIFFICULTY[best.level] ? ' (' + esc(DIFFICULTY[best.level].name) + ')' : ''}</p>` : ''}
    <div class="lvl"><span id="lvlLabel" class="eyebrow">Level for a new career</span>
      <div class="seg three" role="group" aria-labelledby="lvlLabel">${Object.entries(DIFFICULTY).map(([k, d]) => `<button type="button" data-lvl="${k}" aria-pressed="${k === level}">${esc(d.name)}</button>`).join('')}</div>
      <p class="dim" id="lvlNote" role="status">${esc(DIFFICULTY[level].blurb)}</p></div>
    <div class="rowbtn">
      ${resumable ? `<button type="button" class="btn primary" id="ovGo">${saved.scenario ? esc(SCENARIOS[saved.scenario].name) + ' · ' : ''}${saved.over ? `Year-end ${saved.year}` : `Continue · ${MONTHS[saved.month]} ${saved.year}`}</button>` : ''}
      <button type="button" class="btn ${resumable ? 'neutral' : 'primary'}" id="${best ? 'ovNew' : 'ovTrain'}">${best ? 'New career' : 'Start with a training day'}</button>
      <button type="button" class="btn link" id="${best ? 'ovTrain' : 'ovNew'}">${best ? 'New career with a training day' : 'Skip the training'}</button>
      <button type="button" class="btn link" id="ovScen">Scenarios: 2008, 2020 and 2022 crises</button>
      ${Remote.available() ? `<button type="button" class="btn link" id="ovAcct">${Remote.ready() ? (Remote.me().guest ? 'Playing as a guest · sign in to keep your games' : 'Recording as ' + esc(Remote.who())) : 'Sign in to save your games'}</button>` : ''}
    </div>
    ${resumable ? '<p style="color:var(--muted);font-size:12.5px;margin:0">Starting something new replaces your saved game.</p>' : ''}
`);
  const g = $('#ovGo'); if (g) g.onclick = () => { S = saved; save(); play(); };
  $('#ovTrain').onclick = () => startGame({ tutorial:true });
  $('#ovNew').onclick = () => startGame(level === 'standard' ? {} : { difficulty: level });
  $('#ov .lvl .seg').onclick = e => { const b = e.target.closest('[data-lvl]'); if (!b) return; level = b.dataset.lvl; try { localStorage.setItem('bm-level', level); } catch (x) {} document.querySelectorAll('#ov [data-lvl]').forEach(x => x.setAttribute('aria-pressed', x === b)); $('#lvlNote').textContent = DIFFICULTY[level].blurb; };
  $('#ovScen').onclick = scenarioPicker;
  const ac = $('#ovAcct'); if (ac) ac.onclick = () => accountScreen();
}

function start(data){
  if (data && data.save){ try { S = migrate(JSON.parse(data.save)); play(); return; } catch (e) {} }
  if (data && data.fresh){ startGame(); return; }
  dispatch({ type:"newGame" }); begin3(); Scene.setView('hall', true); // a live hall behind the title screen
  S = null; titleScreen();
}
const boot = d => {
  cookieNote();
  start(d || {});
  Remote.init().then(() => {
    const q = new URLSearchParams(location.search);
    if (q.get('reset')) resetScreen(q.get('reset'));
    else if (q.get('confirmed')){ history.replaceState(null, '', location.pathname); if (!S) accountScreen('Email confirmed. Sign in to continue.'); }
    else if (!S && !$('#ov').hidden) titleScreen();           // show the signed-in state on the title screen
  });
};
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (S) Scene.boards(); });
boot();
