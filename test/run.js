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
  assert.strictEqual(JSON.stringify(sys.owner), '{"pricing":"system","credit":"system","treasury":"system","capital":"system"}'); n++;
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
// 9. Unlocks: each strong year (A or better) hands over the next area with a briefing letter; weak years hand over nothing.
{ let granted = 0, withheld = 0;
  for (const seed of [4, 8, 15, 16, 23, 42]) for (const bot of ['careful', 'greedy']){
    const a = play(loadEngine(src), seed, bot, 3), S = a.S, strong = (S.career || []).filter(c => ['AAA', 'AA', 'A'].includes(c.letter)).length;
    const unlocked = S.progress.unlocked.filter(x => x !== 'branch');
    assert.strictEqual(unlocked.length, Math.min(4, strong), 'unlock count should follow strong years: ' + bot + seed);
    assert.strictEqual(JSON.stringify(unlocked), JSON.stringify(['pricing', 'credit', 'treasury', 'capital'].slice(0, unlocked.length)));
    // the letter arrives with the unlock (the inbox only keeps the latest 60 messages, so check at the moment it happens)
    { const R = loadEngine(src); for (const cmd of a.cmds){ const k = R.S ? R.S.progress.unlocked.length : 0; R.dispatch(cmd);
        if (cmd.type === 'nextYear' && R.S.progress.unlocked.length > k) assert(R.S.inbox.some(m => m.from === 'The board' && /is yours/.test(m.subject) && !m.read), 'briefing letter on unlock'); } }
    granted += unlocked.length; withheld += 4 - unlocked.length; n++;
  }
  assert(granted > 0 && withheld > 0, 'need both strong and weak outcomes in the sample: ' + granted + '/' + withheld); n++; }
// 10. Dearer mortgages lose customers: at four points over the system spread far less is lent, and what is lent is riskier.
{ const lent = (spread) => { let bal = 0, pd = 0, k = 0;
    for (const seed of [3, 6, 9, 12, 15, 18]){
      const E = loadEngine(src); const { S } = play(E, seed, 'careful', 1, {}, (run, e) => { e.S.progress.unlocked.push('pricing'); run({ type: 'setPolicy', area: 'pricing', values: { mortgageSpread: spread } }); });
      for (const l of S.loans.filter(l => l.kind === 'mortgage')){ bal += l.bal; pd += l.pd; k++; } }
    return { bal, pd: k ? pd / k : 0 }; };
  const sys = lent(1.05), dear = lent(5.05);
  assert(dear.bal < sys.bal * 0.5, 'dear mortgages should lose most of the volume: ' + dear.bal + ' vs ' + sys.bal); n++; }
// 11. The desk by policy: off until the player takes over credit policy; then applications are decided by the policy,
//     only referrals reach the counter, the books still balance, a replay agrees, and handing it back stops it.
{ const take = (E, values = {}) => { E.S.progress.unlocked.push('pricing', 'credit'); E.dispatch({ type: 'setPolicy', area: 'credit', values }); };
  const off = play(loadEngine(src), 12, 'careful', 1), on = loadEngine(src);
  const a = play(on, 12, 'careful', 1, {}, (run, e) => { e.S.progress.unlocked.push('pricing', 'credit'); run({ type: 'setPolicy', area: 'credit', values: {} }); });
  assert(!off.S.lastDesk, 'no desk without taking over'); assert(a.S.lastDesk && a.S.lastDesk.approved + a.S.lastDesk.declined > 0, 'desk decided applications'); n += 2;
  assert(a.S.inbox.some(m => m.from === 'Credit team') || a.S.lastDesk, 'summary mail'); n++;
  assert(a.S.stats.loans > off.S.stats.loans, 'the desk lends more than one branch counter'); n++;
  // replay reproduces the game exactly with the desk on
  const R = loadEngine(src); for (const cmd of a.cmds){ if (cmd.type === 'setPolicy'){ R.S.progress.unlocked.push('pricing', 'credit'); } R.dispatch(cmd); }
  assert.strictEqual(hashState(R.S, []), hashState(a.S, [])); n++;
  // the month's counter holds only referrals for loans
  { const E = loadEngine(src); E.dispatch({ type: 'newGame', seed: 31 }); take(E);
    for (let m = 0; m < 4; m++){ for (let c; (c = E.current());) E.dispatch({ type: 'resolve', id: c.id, k: c.opts[0].k }); E.dispatch({ type: 'closeMonth' });
      for (const c of E.S.queue.filter(c => (c.kind === 'mortgage' || c.kind === 'personal') && !c.done)) assert.strictEqual(E.policyVerdict(c), 'refer', 'only referrals reach the counter'); }
    n++;
    E.dispatch({ type: 'setPolicy', area: 'credit', release: true });
    assert.strictEqual(E.S.policy.owner.credit, 'system'); assert.strictEqual(E.S.policy.credit.mortgageMaxLtv, 90); n++; }
  // balance: the executive team's cut-offs beat both a loose and a reckless policy over the same games
  const run = (values) => { let p = 0; for (const seed of [3, 6, 9, 12, 15, 18, 21, 24]){ const E = loadEngine(src);
      const { S } = play(E, seed, 'careful', 2, {}, (r, e) => { e.S.progress.unlocked.push('pricing', 'credit'); r({ type: 'setPolicy', area: 'credit', values }); });
      p += E.rating().profit + (S.career || []).reduce((t, c) => t + c.profit, 0); } return p; };
  const sysP = run({}), looseP = run({ mortgageMaxLtv: 95, mortgageMaxLti: 6.5, mortgageMaxAff: 0.6, mortgageMinScore: 400, personalMinScore: 400, personalMaxDebtRatio: 1.2 }),
    wildP = run({ mortgageMaxLtv: 100, mortgageMaxLti: 8, mortgageMaxAff: 0.8, mortgageMinScore: 300, personalMinScore: 300, personalMaxDebtRatio: 2 });
  assert(sysP > looseP && sysP > wildP && wildP < 0, 'system policy should beat loose and reckless: ' + [sysP, looseP, wildP]); n++; }
// 12. Treasury and capital by policy: the cards stop when the player owns the area, the standing rules act, the books
//     still balance (play runs with the strict ledger), and a replay reproduces the game.
{ const unlockAll = (run, e, area, values) => { e.S.progress.unlocked.push('pricing', 'credit', 'treasury', 'capital'); run({ type: 'setPolicy', area, values }); };
  const seen = (subject, area, values, seeds = [2, 5, 8, 11]) => { let k = 0;
    for (const seed of seeds){ const E = loadEngine(src); const a = play(E, seed, 'careful', 2, {}, (run, e) => unlockAll(run, e, area, values)); 
      // replay, counting the mails as they arrive (the inbox only keeps the latest 60)
      const R = loadEngine(src); let last = 0;
      for (const cmd of a.cmds){ if (cmd.type === 'setPolicy') R.S.progress.unlocked.push('pricing', 'credit', 'treasury', 'capital'); R.dispatch(cmd);
        for (const m of R.S.inbox) if (m.id > last && m.subject === subject) k++; last = R.S.mailId; }
      assert.strictEqual(hashState(R.S, []), hashState(a.S, []), 'replay ' + area); }
    return k; };
  assert(seen('Surplus cash invested', 'treasury', { liquidityTarget: 0.1, longShare: 0.5 }) > 0, 'surplus is invested'); n++;
  assert(seen('Gilts sold to restore cash', 'treasury', { liquidityTarget: 0.5, longShare: 1 }) > 0, 'gilts are sold to restore the cash target'); n++;
  assert(seen('Capital below target', 'capital', { capitalTarget: 0.25, capitalAction: 0, raiseAmount: 200 }) > 0, 'capital action fires'); n++;
  { const E = loadEngine(src); const a = play(E, 5, 'careful', 2, {}, (run, e) => unlockAll(run, e, 'capital', { capitalTarget: 0.25, capitalAction: 2 }));
    assert(!(a.S.injected > 0) && a.S.inbox.every(m => m.subject !== 'Capital below target' || /took no action/.test(m.body)), 'carry on raises nothing'); n++; }
  // while the executive team owns an area the old cards still come
  { const kinds = new Set(); for (const seed of [2, 5, 8, 11]){ const E = loadEngine(src); E.dispatch({ type: 'newGame', seed });
      for (let m = 0; m < 12 && !E.S.over; m++){ for (const c of E.S.queue) kinds.add(c.kind); for (let c; (c = E.current());) E.dispatch({ type: 'resolve', id: c.id, k: c.opts[c.opts.length - 1].k }); E.dispatch({ type: 'closeMonth' }); } }
    assert(kinds.has('treasury'), 'treasury cards under the system policy'); n++; }
  { const kinds = new Set(); for (const seed of [2, 5, 8, 11]){ const E = loadEngine(src); E.dispatch({ type: 'newGame', seed }); E.S.progress.unlocked.push('treasury', 'capital'); E.dispatch({ type: 'setPolicy', area: 'treasury', values: {} }); E.dispatch({ type: 'setPolicy', area: 'capital', values: {} });
      for (let m = 0; m < 12 && !E.S.over; m++){ if (m > 0) for (const c of E.S.queue) kinds.add(c.kind); for (let c; (c = E.current());) E.dispatch({ type: 'resolve', id: c.id, k: c.opts[c.opts.length - 1].k }); E.dispatch({ type: 'closeMonth' }); } }
    assert(!kinds.has('treasury') && !kinds.has('capital'), 'no treasury or capital cards once the player owns them'); n++; }
  // an old save with no treasury or capital policy gets them on migrate
  { const E = loadEngine(src); E.dispatch({ type: 'newGame', seed: 3 }); const old = JSON.parse(JSON.stringify(E.S)); delete old.policy.treasury; delete old.policy.capital; delete old.policy.owner.treasury; delete old.policy.owner.capital;
    const m = loadEngine(src).migrate(old); assert.strictEqual(m.policy.owner.capital, 'system'); assert.strictEqual(m.policy.treasury.liquidityTarget, 0.2); n++; }
  // cut-offs are range-checked
  { const E = loadEngine(src); E.dispatch({ type: 'newGame', seed: 3 }); E.S.progress.unlocked.push('treasury', 'capital');
    assert.throws(() => E.dispatch({ type: 'setPolicy', area: 'treasury', values: { liquidityTarget: 0.01 } }), /between/);
    assert.throws(() => E.dispatch({ type: 'setPolicy', area: 'capital', values: { capitalTarget: 0.05 } }), /between/); n++; }
}
// 13. Fair value and quiet months.
{ // gilts at market value only for a treasury owner; the ledger follows, and handing treasury back returns to cost
  const E = loadEngine(src); E.dispatch({ type: 'newGame', seed: 7 }); E.S.path = 'sticky';
  const cost = E.S.gilts.reduce((a, g) => a + g.amt, 0);
  assert(Math.abs(E.S.ledger.bal.gilts - cost) < 1e-9); n++;
  E.S.progress.unlocked.push('treasury'); E.dispatch({ type: 'setPolicy', area: 'treasury', values: { liquidityTarget: 0.3, longShare: 1 } });
  let moved = false;
  for (let m = 0; m < 8 && !E.S.over; m++){ for (let c; (c = E.current());) E.dispatch({ type: 'resolve', id: c.id, k: c.opts[c.opts.length - 1].k }); E.dispatch({ type: 'closeMonth' });
    if (!E.S.over){ assert(Math.abs(E.S.ledger.bal.gilts - E.giltMV()) < 1e-6, 'ledger carries gilts at market value'); if (Math.abs(E.giltMV() - E.giltBook()) > 1) moved = true; } }
  assert(moved, 'market value should move away from cost in a sticky year'); n++;
  E.dispatch({ type: 'setPolicy', area: 'treasury', release: true });
  assert(Math.abs(E.S.ledger.bal.gilts - E.giltBook()) < 1e-6, 'handed back: gilts return to cost'); n++; }
{ // a treasury owner's capital drops when long gilts lose value; a non-owner's does not (until the gilts are sold)
  const run = (own) => { const E = loadEngine(src); E.dispatch({ type: 'newGame', seed: 9 }); E.S.path = 'sticky';
    E.S.gilts = [{ kind: 'long', amt: 3000, coupon: 4.8, dur: 8.2, y0: 4.65 }];
    // keep the ledger honest: restate the gilt balance and cash for the bigger holding
    const d = 3000 - E.S.ledger.bal.gilts; E.S.cash -= d; E.S.ledger.bal.cash -= d; E.S.ledger.bal.gilts += d;
    if (own){ E.S.progress.unlocked.push('treasury'); E.dispatch({ type: 'setPolicy', area: 'treasury', values: { liquidityTarget: 0.1, longShare: 1 } }); }
    for (let m = 0; m < 10 && !E.S.over; m++){ for (let c; (c = E.current());) E.dispatch({ type: 'resolve', id: c.id, k: c.opts[c.opts.length - 1].k }); E.dispatch({ type: 'closeMonth' }); }
    return { cap: E.capRatio(), gap: E.giltBook() - E.giltMV() }; };
  const a = run(false), b = run(true);
  assert(a.gap > 10, 'rates rose so the gilts lost value: ' + a.gap); n++;
  assert(b.cap < a.cap, 'fair value should lower capital after a loss in value: ' + [a.cap, b.cap]); n++; }
{ // three quiet months after taking over an area: scheduled shocks move out of the window and come back after it
  const E = loadEngine(src); E.dispatch({ type: 'newGame', seed: 13 });
  E.S.sched.liq = [2]; E.S.sched.out = 1; E.S.sched.crash = 3;
  E.S.progress.unlocked.push('pricing'); E.dispatch({ type: 'setPolicy', area: 'pricing', values: {} });
  assert.strictEqual(E.quietLeft(), 4); assert(E.S.inbox.some(m => m.subject === 'Three quiet months')); n++;
  assert(E.S.sched.liq.every(m => m >= 4) && E.S.sched.out >= 4 && E.S.sched.crash >= 4, 'shocks moved after the quiet months: ' + JSON.stringify(E.S.sched)); n++;
  const kinds = []; for (let m = 1; m <= 5; m++){ for (let c; (c = E.current());) E.dispatch({ type: 'resolve', id: c.id, k: c.opts[c.opts.length - 1].k }); E.dispatch({ type: 'closeMonth' }); kinds.push(E.S.queue.map(c => c.kind)); }
  assert(!kinds.slice(0, 3).some(k => k.includes('liqshock') || k.includes('outage')), 'no liquidity shock or outage in the quiet months'); n++;
  assert(kinds[3].includes('liqshock') || kinds[3].includes('outage'), 'the shocks arrive after the quiet months'); n++;
  // taking over again does not restart it, and a second area gets its own quiet months
  E.dispatch({ type: 'setPolicy', area: 'pricing', values: { cardRate: 25 } }); assert(E.quietLeft() <= 1); n++; }
console.log('ok', n, 'checks');
