const fs = require('fs'), path = require('path'), assert = require('assert');
const { loadEngine, play, hashState, POLICIES, ALL } = require('../tools/harness');
const src = fs.readFileSync(path.join(__dirname, '..', 'engine', 'engine.js'), 'utf8');
const golden = JSON.parse(fs.readFileSync(path.join(__dirname, 'golden.json'), 'utf8'));
let n = 0;
// 1. Behaviour is unchanged against snapshots from the original engine (all bots, scenarios, tutorial).
const IGNORE = ['engine', 'progress', 'inbox', 'mailId', 'ledger', 'policy'];
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
// 7. Portfolio view: cohorts reconcile exactly to the loan book, to risk-weighted assets and to the arrears statuses, in every bot's game.
for (const pol of ALL()) for (const seed of [3, 17]){
  const a = play(loadEngine(src), seed, pol, 3), E = loadEngine(src); let checks = 0;
  const reconcile = () => {
    const co = E.portfolio(), S = E.S, near = (x, y) => Math.abs(x - y) < 1e-6;
    assert(near(co.reduce((t, c) => t + c.bal, 0), E.loanSum()), 'cohort balances differ from the loan book');
    assert.strictEqual(co.reduce((t, c) => t + c.n, 0), S.loans.length);
    assert(near(co.reduce((t, c) => t + c.rwa, 0), S.loans.reduce((t, l) => t + l.bal * E.loanRW(l), 0)), 'cohort RWA differs');
    for (const c of co){ assert(near(Object.values(c.buckets).reduce((t, x) => t + x, 0), c.bal), 'buckets do not add to the balance'); assert(c.pd >= 0 && c.pd <= 1 && c.lgd >= 0 && c.lgd <= 1 + 1e-9, 'pd or lgd out of range'); }
    checks++;
  };
  for (const cmd of a.cmds){ E.dispatch(cmd); if (cmd.type === 'closeMonth') reconcile(); }
  assert(checks >= 12); n++;
}
// 8. System policy: every game starts with it; setPolicy is refused until the area is unlocked, then changes pricing;
//    the verdict separates good applications from bad using only what the applicant shows.
{ const E = loadEngine(src); E.dispatch({ type: 'newGame', seed: 21 });
  const sys = JSON.parse(JSON.stringify(E.S.policy));
  assert.strictEqual(JSON.stringify(sys.owner), '{"pricing":"system","credit":"system"}'); n++;
  const refuses = (cmd, why) => { const snap = JSON.stringify(E.S.policy); assert.throws(() => E.dispatch(cmd), why); assert.strictEqual(JSON.stringify(E.S.policy), snap); n++; };
  refuses({ type: 'setPolicy', area: 'pricing', values: { cardRate: 5 } }, /not unlocked/);
  refuses({ type: 'setPolicy', area: 'credit', values: { mortgageMaxLtv: 99 } }, /not unlocked/);
  E.S.progress.unlocked.push('pricing');
  refuses({ type: 'setPolicy', area: 'pricing', values: { cardRate: 99 } }, /between/);
  refuses({ type: 'setPolicy', area: 'pricing', values: { nope: 1 } }, /unknown setting/);
  refuses({ type: 'setPolicy', area: 'pricing', values: { cardRate: 'x' } }, /between/);
  refuses({ type: 'setPolicy', area: 'credit', values: { mortgageMaxLtv: 99 } }, /not unlocked/);
  const before = E.mortgageRisk({ loan: 200, price: 250, term: 25, inc: 60, score: 700, emp: 'Permanent', missed: 0 }).rate;
  E.dispatch({ type: 'setPolicy', area: 'pricing', values: { mortgageSpread: 2.05 } });
  const after = E.mortgageRisk({ loan: 200, price: 250, term: 25, inc: 60, score: 700, emp: 'Permanent', missed: 0 }).rate;
  assert(Math.abs(after - before - 1) < 1e-9, 'mortgage rate follows the policy'); assert.strictEqual(E.S.policy.owner.pricing, 'player'); assert.strictEqual(E.S.policy.owner.credit, 'system'); n += 2;
  // an old save with no policy gets the system policy
  const old = JSON.parse(JSON.stringify(E.S)); delete old.policy; assert.strictEqual(JSON.stringify(loadEngine(src).migrate(old).policy), JSON.stringify(sys)); n++;
  // the verdict is useful: declined applications are worse risks than approved ones
  const seen = { mortgage: { approve: [], refer: [], decline: [] } };
  for (const seed of [2, 5, 9, 14, 23, 31]){
    const G = loadEngine(src); G.dispatch({ type: 'newGame', seed });
    while (!G.S.over){
      for (let c; (c = G.current());){ if (c.kind === 'mortgage') seen.mortgage[G.policyVerdict(c)].push(G.mortgageRisk(c.h).pd); G.dispatch({ type: 'resolve', id: c.id, k: c.opts[0].k }); }
      G.dispatch({ type: 'closeMonth' });
    }
  }
  const avg = a => a.reduce((t, x) => t + x, 0) / a.length, m = seen.mortgage;
  assert(m.approve.length >= 10 && m.decline.length >= 3, 'need approved and declined mortgages: ' + [m.approve.length, m.refer.length, m.decline.length]);
  assert(avg(m.decline) > 2 * avg(m.approve), 'declined mortgages should be far riskier: ' + avg(m.decline) + ' vs ' + avg(m.approve)); n++; }
console.log('ok', n, 'checks');
