const fs = require('fs'), path = require('path'), assert = require('assert');
const { loadEngine, play, hashState, POLICIES, ALL } = require('../tools/harness');
const src = fs.readFileSync(path.join(__dirname, '..', 'engine', 'engine.js'), 'utf8');
const golden = JSON.parse(fs.readFileSync(path.join(__dirname, 'golden.json'), 'utf8'));
let n = 0;
// 1. Behaviour is unchanged against snapshots from the original engine (all bots, scenarios, tutorial).
const IGNORE = ['engine', 'progress', 'inbox', 'mailId', 'ledger'];
{ const Eg = loadEngine(src); Eg.dispatch({ type: 'newGame', seed: 1 });
  for (const [key, want] of Object.entries(golden)){
    const [bot, tag, seed] = key.split(':');
    const opts = tag === 'tutorial' ? { tutorial: true } : tag.startsWith('scn-') ? { scenario: tag.slice(4) } : {};
    const { S } = play(loadEngine(src), +seed, bot, 3, opts);
    assert.strictEqual(hashState(S, IGNORE), want, 'golden mismatch for ' + key); n++;
  } }
// 2. Replay: seed + engine version + ordered commands rebuild the identical game.
for (const pol of ALL()) for (const seed of [3, 17, 41]){
  const a = play(loadEngine(src), seed, pol, 3), E2 = loadEngine(src);
  for (const cmd of a.cmds) E2.dispatch(cmd);
  assert.strictEqual(hashState(E2.S, []), hashState(a.S, []), 'replay mismatch ' + pol + seed); n++;
}
// 3. Engine state carries version and progress; only branch mode is unlocked at the start.
const E = loadEngine(src); E.dispatch({ type: 'newGame', seed: 5 });
assert.strictEqual(E.S.engine, 2); assert.strictEqual(JSON.stringify(E.S.progress.unlocked), '["branch"]'); n++;
// 4. Games do progress (not stuck on the first month).
const g = play(loadEngine(src), 9, 'mixed', 3); assert(g.cmds.length > 100, 'game did not progress'); n++;
// 5. Mail is engine state: welcome mail exists, each month adds mail, reading is a command, replay reproduces the inbox.
{ const E = loadEngine(src); E.dispatch({ type: 'newGame', seed: 8 });
  assert.strictEqual(E.S.inbox.length, 1); assert.strictEqual(E.S.inbox[0].subject, 'Welcome to Counting House');
  E.dispatch({ type: 'read', key: 'm' + E.S.inbox[0].id }); assert.strictEqual(E.S.inbox[0].read, true);
  for (let c; (c = E.current());) E.dispatch({ type: 'resolve', id: c.id, k: c.opts[0].k });
  const before = E.S.inbox.length; E.dispatch({ type: 'closeMonth' });
  assert(E.S.inbox.length > before, 'closing a month should add mail'); n++;
  assert(E.S.inbox.some(m => m.subject === 'February outlook'), 'outlook mail'); n++;
  // an old save with no mail gets the welcome mail on migrate
  const old = JSON.parse(JSON.stringify(E.S)); old.inbox = []; old.month = 0; old.over = null;
  const E3 = loadEngine(src); const m = E3.migrate(old); assert.strictEqual(m.inbox.length, 1); n++; }
// 6. Ledger: every entry balances, streamed entries rebuild the balances, P&L from the journal equals the reported profit,
//    a direct unjournaled change is caught, and the ledger survives a save/load round trip.
{ const E = loadEngine(src), entries = []; E.setSink(e => entries.push(e));
  E.dispatch({ type: 'newGame', seed: 11 });
  let checkedMonths = 0;
  for (let m = 0; m < 12 && !E.S.over; m++){
    const plBefore = Object.entries(E.S.ledger.bal).filter(([a]) => a.startsWith('pl.')).reduce((t, [, v]) => t + v, 0);
    for (let c; (c = E.current());) E.dispatch({ type: 'resolve', id: c.id, k: E.S.cash > 500 ? c.opts[0].k : c.opts[c.opts.length - 1].k });
    const rep = E.dispatch({ type: 'closeMonth' });
    // the month's reported profit is the journal's P&L movement since the month opened
    const plAfter = Object.entries(E.S.ledger.bal).filter(([a]) => a.startsWith('pl.')).reduce((t, [, v]) => t + v, 0);
    assert(Math.abs(-(plAfter - plBefore) - rep.profit) < 1e-6, 'journal profit != reported profit in month ' + m); checkedMonths++;
  }
  assert(checkedMonths >= 6 && entries.length > 100); n++;
  for (const e of entries) assert(Math.abs(e.lines.reduce((t, l) => t + l[1], 0)) < 1e-6, 'unbalanced ' + e.memo);
  n++;
  const rebuilt = {}; for (const e of entries) for (const [a, d] of e.lines) rebuilt[a] = (rebuilt[a] || 0) + d;
  for (const [a, v] of Object.entries(E.S.ledger.bal)) assert(Math.abs((rebuilt[a] || 0) - v) < 1e-6, 'sink does not rebuild ' + a);
  assert.strictEqual(entries.length, E.S.ledger.n); n++;
  assert.strictEqual(entries[0].memo, 'opening'); assert.strictEqual(E.ledgerCheck().length, 0); n++;
  // a balance changed outside the journal must be detected
  E.S.cash += 1; assert(E.ledgerCheck().some(p => p.startsWith('cash')), 'unjournaled change not caught'); E.S.cash -= 1; n++;
  // save/load round trip, then keep playing: same result as playing straight through
  const A = loadEngine(src), B = loadEngine(src);
  A.dispatch({ type: 'newGame', seed: 21 }); B.dispatch({ type: 'newGame', seed: 21 });
  const step = (X) => { for (let c; (c = X.current());) X.dispatch({ type: 'resolve', id: c.id, k: c.opts[0].k }); X.dispatch({ type: 'closeMonth' }); };
  for (let i = 0; i < 3; i++){ step(A); step(B); }
  B.S = B.migrate(JSON.parse(JSON.stringify(B.S)));
  for (let i = 0; i < 3; i++){ step(A); step(B); }
  A.S.stats.harsh = A.S.stats.harsh || 0;   // migrate normalises stats.harsh from undefined to 0
  assert.strictEqual(hashState(B.S, []), hashState(A.S, [])); n++;
  // an old save with no ledger gets an opening entry on migrate
  const old = JSON.parse(JSON.stringify(A.S)); delete old.ledger; const mg = loadEngine(src).migrate(old);
  assert.strictEqual(mg.ledger.n, 1); n++; }
console.log('ok', n, 'checks');
