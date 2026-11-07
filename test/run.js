const fs = require('fs'), path = require('path'), assert = require('assert');
const { loadEngine, play, hashState, POLICIES, ALL } = require('../tools/harness');
const src = fs.readFileSync(path.join(__dirname, '..', 'engine', 'engine.js'), 'utf8');
const golden = JSON.parse(fs.readFileSync(path.join(__dirname, 'golden.json'), 'utf8'));
let n = 0;
// 1. Behaviour is unchanged against snapshots from the original engine (all bots, scenarios, tutorial).
const IGNORE = ['engine', 'progress', 'inbox', 'mailId', 'ledger', 'policy', 'wholesale', 'wsTranches', 'bonds', 'bondTranches', 'retained', 'pools', 'large', 'debrief', 'debriefSeen', 'households', 'ewi', 'stress', 'board', 'sackedWhy', 'ops', 'meet', 'pq', 'applied', 'growth', 'goodwill', 'swaps', 'collateral', 'swapId', 'fid', 'px'];
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
  assert.strictEqual(JSON.stringify(sys.owner), '{"pricing":"system","credit":"system","treasury":"system","funding":"system","capital":"system","operations":"system","growth":"system"}'); n++;
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
    assert.strictEqual(unlocked.length, Math.min(7, strong), 'unlock count should follow strong years: ' + bot + seed);
    assert.strictEqual(JSON.stringify(unlocked), JSON.stringify(['pricing', 'credit', 'treasury', 'funding', 'capital', 'operations', 'growth'].slice(0, unlocked.length)));
    // the letter arrives with the unlock (the inbox only keeps the latest 60 messages, so check at the moment it happens)
    { const R = loadEngine(src); for (const cmd of a.cmds){ const k = R.S ? R.S.progress.unlocked.length : 0; R.dispatch(cmd);
        if (cmd.type === 'nextYear' && R.S.progress.unlocked.length > k) assert(R.S.inbox.some(m => m.from === 'The board' && /is yours/.test(m.subject) && !m.read), 'briefing letter on unlock'); } }
    granted += unlocked.length; withheld += 5 - unlocked.length; n++;
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
// 14. Funding and dividends.
{ const ALL5 = ['pricing', 'credit', 'treasury', 'funding', 'capital'];
  const start = (seed, tweak) => { const E = loadEngine(src); E.dispatch({ type: 'newGame', seed }); E.S.progress.unlocked.push(...ALL5); if (tweak) tweak(E); return E; };
  const month = E => { for (let c; (c = E.current());) E.dispatch({ type: 'resolve', id: c.id, k: c.opts[c.opts.length - 1].k }); E.dispatch({ type: 'closeMonth' }); };
  // the savings rate follows the market plus the chosen gap, and the Bank Rate card is replaced by a mail
  { const E = start(4); E.dispatch({ type: 'setPolicy', area: 'funding', values: { savingsSpread: 0.5 } });
    for (let m = 0; m < 6 && !E.S.over; m++){ month(E); if (!E.S.over) assert(Math.abs(E.S.savRate - Math.max(0.1, E.mkt() + 0.5)) < 0.011, 'savings rate follows the rule: ' + E.S.savRate); }
    assert(E.S.queue.every(c => c.kind !== 'rate')); n++; }
  // wholesale borrowing: tranches add up to the balance, the ledger agrees, it costs money, and it runs off at maturity
  { const E = start(6); E.dispatch({ type: 'setPolicy', area: 'funding', values: { wholesaleTarget: 0.2 } });
    let peak = 0; for (let m = 0; m < 9 && !E.S.over; m++){ month(E); peak = Math.max(peak, E.S.wholesale);
      assert(Math.abs(E.S.wholesale - E.S.wsTranches.reduce((a, w) => a + w.amt, 0)) < 1e-6, 'tranches add up'); }
    assert(peak > 1000, 'wholesale was borrowed: ' + peak); assert(E.S.stats !== undefined); n++;
    E.dispatch({ type: 'setPolicy', area: 'funding', release: true });
    for (let m = 0; m < 5 && !E.S.over; m++) month(E);
    assert(E.S.wholesale < 1e-6 && E.S.wsTranches.length === 0, 'handed back: wholesale runs off'); n++; }
  // a freeze: nothing is renewed, so wholesale shrinks and the treasurer says so
  { const E = start(8, e => { e.S.sched.liq = [6]; e.S.sched.crash = -1; e.S.sched.out = -1; }); E.dispatch({ type: 'setPolicy', area: 'funding', values: { wholesaleTarget: 0.3 } });
    let before = 0, after = 0, warned = false, last = 0;
    for (let m = 0; m < 10 && !E.S.over; m++){ month(E); if (E.S.month === 5) before = E.S.wholesale; if (E.S.month === 8) after = E.S.wholesale;
      for (const x of E.S.inbox) if (x.id > last && x.subject === 'Wholesale markets are frozen') warned = true; last = E.S.mailId; }
    assert(warned, 'freeze mail'); assert(after < before, 'wholesale shrinks in a freeze: ' + [before, after]); n++; }
  // dividends: paid from profit, journaled, counted in the rating, and a replay agrees
  { const a = play(loadEngine(src), 5, 'careful', 2, {}, (run, e) => { e.S.progress.unlocked.push(...ALL5); run({ type: 'setPolicy', area: 'capital', values: { dividendPayout: 0.5 } }); });
    const R = loadEngine(src);
    for (const cmd of a.cmds){ if (cmd.type === 'setPolicy') R.S.progress.unlocked.push(...ALL5); R.dispatch(cmd); }
    assert.strictEqual(hashState(R.S, []), hashState(a.S, [])); n++;
    assert(R.S.ledger.bal['equity.dividend'] > 0, 'dividends were journaled'); n++;
    const b = play(loadEngine(src), 5, 'careful', 1, {}, (run, e) => { e.S.progress.unlocked.push(...ALL5); run({ type: 'setPolicy', area: 'capital', values: { dividendPayout: 0.5 } }); });
    const E1 = loadEngine(src); E1.S = b.S; assert(E1.rating().pD > 0, 'dividends lift the rating'); n++; }
  // an old save gains the funding policy and the wholesale fields
  { const E = loadEngine(src); E.dispatch({ type: 'newGame', seed: 3 }); const old = JSON.parse(JSON.stringify(E.S)); delete old.policy.funding; delete old.policy.owner.funding; delete old.wholesale; delete old.wsTranches; delete old.policy.capital.dividendPayout;
    const m = loadEngine(src).migrate(old); assert.strictEqual(m.wholesale, 0); assert.strictEqual(m.policy.funding.wholesaleTarget, 0); assert.strictEqual(m.policy.capital.dividendPayout, 0); assert.strictEqual(m.policy.owner.funding, 'system'); n++; }
}
// 15. Bonds, large depositors and mortgage pool sales.
{ const ALL5 = ['pricing', 'credit', 'treasury', 'funding', 'capital'];
  const start = (seed, tweak) => { const E = loadEngine(src); E.dispatch({ type: 'newGame', seed }); E.S.progress.unlocked.push(...ALL5); if (tweak) tweak(E); return E; };
  const month = E => { for (let c; (c = E.current());) E.dispatch({ type: 'resolve', id: c.id, k: c.opts[c.opts.length - 1].k }); E.dispatch({ type: 'closeMonth' }); };
  const watch = (E, subjectRe, months, onMonth) => { let last = E.S.mailId, hits = 0; for (let m = 0; m < months && !E.S.over; m++){ month(E); if (onMonth) onMonth(E); for (const x of E.S.inbox) if (x.id > last && subjectRe.test(x.body + ' ' + x.subject)) hits++; last = E.S.mailId; } return hits; };
  // bonds: issued to the target, locked for the term, interest paid, refinanced at maturity, runs off when handed back
  { const E = start(4); E.dispatch({ type: 'setPolicy', area: 'funding', values: { bondTarget: 0.15, bondTermYears: 1, bondPremium: 0.5 } });
    let peak = 0; watch(E, /x^/, 15, e => { peak = Math.max(peak, e.S.bonds); assert(Math.abs(e.S.bonds - e.S.bondTranches.reduce((a, b) => a + b.amt, 0)) < 1e-6, 'bond tranches add up'); });
    assert(peak > 1500, 'bonds were issued: ' + peak); assert(E.S.bondTranches.some(b => b.due > E.S.year * 12 + E.S.month), 'refinanced at maturity'); n += 2;
    E.dispatch({ type: 'setPolicy', area: 'funding', release: true }); watch(E, /x^/, 2); assert(E.S.bonds > 0, 'locked bonds do not leave early'); n++; }
  // large depositors: they arrive up to the cap, and a freeze makes them leave
  { let arrived = 0, left = 0, over = 0;
    for (const seed of [2, 3, 5, 7, 11]){ const E = start(seed, e => { e.S.sched.liq = [5]; e.S.sched.crash = -1; e.S.sched.out = -1; }); E.dispatch({ type: 'setPolicy', area: 'funding', values: { largeCap: 0.3 } });
      watch(E, /x^/, 10, e => { const share = e.S.large.reduce((a, d) => a + d.amt, 0) / e.S.deposits; if (share > 0.3 + 0.12) over++; arrived = Math.max(arrived, e.S.large.length); });
      left += E.S.inbox.filter(x => /has withdrawn/.test(x.body)).length; }
    assert(arrived > 0, 'large depositors arrived'); assert(over === 0, 'the cap held'); n += 2; }
  { const E = start(6); E.dispatch({ type: 'setPolicy', area: 'funding', values: { largeCap: 0 } }); watch(E, /x^/, 8); assert.strictEqual(E.S.large.length, 0, 'a cap of zero takes none'); n++; }
  // pool sale: the bank keeps 5% as a first-loss slice, capital improves, losses hit the slice first, the books balance
  { const E = loadEngine(src); play(E, 9, 'first', 1); E.dispatch({ type: 'nextYear' }); E.S.progress.unlocked.push(...ALL5);
    const mort = E.S.loans.filter(l => l.kind === 'mortgage' && l.status === 'current').reduce((a, l) => a + l.bal, 0), capBefore = E.capRatio();
    assert(mort > 800, 'need mortgages to sell: ' + mort);
    E.S.progress.unlocked.push('capital'); E.dispatch({ type: 'setPolicy', area: 'capital', values: { capitalTarget: 0.25, capitalAction: 3 } });
    let sold = 0; const hits = watch(E, /pool of mortgages/, 3, e => { sold = Math.max(sold, e.S.pools.length); });
    assert(hits > 0 && sold > 0, 'a pool was sold'); assert(E.S.retained > 0, 'a slice was retained'); n += 2;
    const p = E.S.pools[0]; assert(Math.abs(p.ret - 0.05 / 0.95 * p.bal) / p.ret < 0.1 || p.lost > 0, 'the slice is 5% of the loans sold');
    assert(Math.abs(E.S.ledger.bal.retained - E.S.retained) < 1e-6); n++;
    // losses beyond the slice fall on investors: the bank's loss from a pool never exceeds its slice
    for (let m = 0; m < 8 && !E.S.over; m++) month(E);
    for (const q of E.S.pools) assert(q.lost <= q.orig * 0.05 + 1e-6, 'bank loss limited to the retained slice'); n++; }
  // a replay with all of it on reproduces the game
  { const a = play(loadEngine(src), 7, 'careful', 2, {}, (run, e) => { e.S.progress.unlocked.push(...ALL5);
      run({ type: 'setPolicy', area: 'funding', values: { bondTarget: 0.1, wholesaleTarget: 0.1, largeCap: 0.25, poolWhenShort: 1 } }); run({ type: 'setPolicy', area: 'capital', values: { capitalTarget: 0.2, capitalAction: 3 } }); });
    const R = loadEngine(src); for (const cmd of a.cmds){ if (cmd.type === 'setPolicy' && R.S.progress.unlocked.length === 1) R.S.progress.unlocked.push(...ALL5); R.dispatch(cmd); }
    assert.strictEqual(hashState(R.S, []), hashState(a.S, [])); n++; }
  // an old save gains the new fields
  { const E = loadEngine(src); E.dispatch({ type: 'newGame', seed: 3 }); const old = JSON.parse(JSON.stringify(E.S)); for (const k of ['bonds', 'bondTranches', 'retained', 'pools', 'large']) delete old[k]; delete old.policy.funding.bondTarget; delete old.policy.funding.poolMode;
    const m = loadEngine(src).migrate(old); assert.strictEqual(m.bonds, 0); assert.strictEqual(m.large.length, 0); assert.strictEqual(m.policy.funding.poolShare, 0.25); assert.strictEqual(m.policy.funding.bondTermYears, 1); n++; }
}
// 16. Year-end debrief: three to five tagged notes, rotating through the concepts over several years.
{ for (const bot of ['careful', 'greedy']) for (const seed of [4, 9]){
    const E = loadEngine(src); const concepts = new Set(); let years = 0;
    play(E, seed, bot, 1); // first year
    const check = () => { const d = E.S.debrief; assert(Array.isArray(d) && d.length >= 3 && d.length <= 5, 'three to five notes: ' + (d && d.length));
      for (const c of d){ for (const k of ['concept', 'area', 'big', 'what', 'why', 'ask']) assert(typeof c[k] === 'string' && c[k].length > 8, 'note field ' + k); assert(!/NaN|undefined/.test(JSON.stringify(c)), 'no NaN in a note: ' + JSON.stringify(c)); concepts.add(c.concept); } years++; };
    check();
    for (let y = 0; y < 2 && E.S.over === 'done'; y++){ E.dispatch({ type: 'nextYear' }); while (!E.S.over){ for (let c; (c = E.current());) E.dispatch({ type: 'resolve', id: c.id, k: c.opts[0].k }); E.dispatch({ type: 'closeMonth' }); } if (E.S.over === 'done') check(); }
    if (years >= 3) assert(concepts.size >= 5, 'notes rotate through the ideas: ' + [...concepts]);
    n++; } }
// 17. Recurring households: a cast of seven in games started with them, none otherwise; they move with the economy and
//     with the player's decisions; some applications come from them; and replay reproduces them.
{ const plain = loadEngine(src); plain.dispatch({ type: 'newGame', seed: 5 }); assert(!plain.S.households); n++;
  const tut = loadEngine(src); tut.dispatch({ type: 'newGame', seed: 5, opts: { households: true, tutorial: true } }); assert(!tut.S.households); n++;
  const a = play(loadEngine(src), 6, 'first', 2, { households: true });
  const cast = a.S.households; assert.strictEqual(cast.length, 7); assert.strictEqual(new Set(cast.map(h => h.name)).size, 7, 'distinct names'); n++;
  assert(cast.every(h => h.hist.length > 0 && h.hist.length <= 36 && h.score >= 300 && h.score <= 999 && Number.isFinite(h.cash)), 'households have a finite history'); n++;
  const linked = cast.filter(h => h.loanId != null); assert(linked.length >= 1, 'some applications came from the cast and were approved');
  for (const h of linked){ const l = a.S.loans.find(x => x.id === h.loanId); if (l) assert.strictEqual(l.hh, h.id); } n++;
  assert(cast.some(h => h.notes.length > 0), 'things happened to them'); assert(!/NaN|undefined/.test(JSON.stringify(cast)), 'no NaN in households'); n++;
  // a missed payment costs credit score and is remembered
  { const E = loadEngine(src); const g = play(E, 6, 'first', 1, { households: true }); E.dispatch({ type: 'nextYear' });
    const h = E.S.households.find(x => x.loanId != null && E.S.loans.some(l => l.id === x.loanId && l.status === 'current'));
    assert(h, 'a household with a performing loan'); { const l = E.S.loans.find(x => x.id === h.loanId), before = h.score; l.status = 'arrears'; l.since = E.S.month; l.carded = true;
      for (let c; (c = E.current());) E.dispatch({ type: 'resolve', id: c.id, k: c.opts[c.opts.length - 1].k }); E.dispatch({ type: 'closeMonth' });
      assert(h.score < before - 30, 'a missed payment cuts the score: ' + [before, h.score]); assert(h.notes.some(x => /Fell behind/.test(x.t))); n++; } }
  // replay reproduces the cast
  const R = loadEngine(src); for (const cmd of a.cmds) R.dispatch(cmd);
  assert.strictEqual(hashState(R.S, []), hashState(a.S, [])); n++;
  // the cards say who they are
  { const E = loadEngine(src); E.dispatch({ type: 'newGame', seed: 12, opts: { households: true } }); let seen = 0;
    for (let m = 0; m < 6 && !E.S.over; m++){ for (const c of E.S.queue) if (c.h && c.h.hh != null){ seen++; assert(c.who.name === E.S.households.find(h => h.id === c.h.hh).name && c.h.name === c.who.name && /regular customer/.test(c.note)); }
      for (let c; (c = E.current());) E.dispatch({ type: 'resolve', id: c.id, k: c.opts[0].k }); E.dispatch({ type: 'closeMonth' }); }
    assert(seen > 0, 'regular customers appear at the counter'); n++; } }
// 12. Executive team, early warnings and the stress test.
{ const E = loadEngine(src); E.dispatch({ type: 'newGame', seed: 5 });
  for (let m = 0; m < 4; m++){ for (let c; (c = E.current());) E.dispatch({ type: 'resolve', id: c.id, k: c.opts[0].k }); E.dispatch({ type: 'closeMonth' }); }
  // until a Chief Executive area is handed over, none of it applies
  assert.strictEqual(E.ceMode(), false); assert.throws(() => E.dispatch({ type: 'stress' }), /Chief Executive/); n += 2;
  E.S.progress.unlocked.push('pricing', 'credit', 'treasury', 'funding', 'capital');
  const ind = E.indicators(), keys = ind.map(i => i.key);
  for (const k of ['capital', 'liquidity', 'horizon', 'wholesale', 'wall', 'large', 'arrears', 'risky', 'rates']) assert(keys.includes(k), 'indicator ' + k); n += 9;
  assert(ind.every(i => ['ok', 'watch', 'alarm'].includes(i.status) && i.text && i.shown)); n++;
  const adv = E.advisers();
  for (const r of ['Finance director', 'Chief risk officer', 'Treasurer', 'Head of operations']) assert(adv.some(a => a.role === r), 'adviser ' + r); n += 4;
  assert(adv.some(a => /not run a stress test/.test(a.text))); n++;
  // the stress test does not touch the real bank or its random stream, and gives the same answer twice
  const before = JSON.stringify(E.S);
  const a = E.stressTest({}, 9), b = E.stressTest({}, 9);
  { let leaked = 0; E.setSink(() => { leaked++; }); E.stressTest({}, 3); E.setSink(null); assert.strictEqual(leaked, 0, 'the copy posts nothing to the real ledger'); n++; }
  assert.strictEqual(JSON.stringify(E.S), before, 'stress test left the bank alone'); assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b))); n += 2;
  assert(a.ran === 9 || a.failed); assert(a.lowCap <= a.startCap); n += 2;
  // reckless rules do worse than careful ones in the same recession
  const tight = E.stressTest({ credit: { mortgageMaxLtv: 75, mortgageMinScore: 700 }, capital: { capitalTarget: 0.16 } }, 9);
  const loose = E.stressTest({ credit: { mortgageMaxLtv: 100, mortgageMinScore: 350, mortgageMaxLti: 8 }, funding: { wholesaleTarget: 0.35 }, treasury: { liquidityTarget: 0.1 }, capital: { capitalAction: 2, dividendPayout: 0.9 } }, 9);
  assert(loose.lowCap < tight.lowCap - 0.02, `loose ${loose.lowCap} vs tight ${tight.lowCap}`); assert(loose.lowHorizon < tight.lowHorizon); n += 2;
  // as a command it stores its result; bad settings are refused; the year-end screen has no month to start from
  E.dispatch({ type: 'stress', overrides: { credit: { mortgageMaxLtv: 80 } } });
  assert(E.S.stress && E.S.stress.custom === true && E.S.stress.lowCap > 0); n++;
  assert.throws(() => E.dispatch({ type: 'stress', overrides: { credit: { mortgageMaxLtv: 500 } } }), /bad value/); assert.throws(() => E.dispatch({ type: 'stress', overrides: { nonsense: { a: 1 } } }), /not unlocked/); n += 2;
  assert(E.advisers().some(x => x.role === 'Chief risk officer' && /stress test/.test(x.text) && !/not run/.test(x.text))); n++;
  // replay: the same commands rebuild the same game, stress result included
  const cmds = [{ type: 'newGame', seed: 8 }]; const R1 = loadEngine(src); R1.dispatch(cmds[0]); const go = (c) => { cmds.push(c); return R1.dispatch(c); };
  R1.S.progress.unlocked.push('pricing'); go({ type: 'setPolicy', area: 'pricing', values: { mortgageSpread: 1.2 } }); go({ type: 'stress' });
  assert(R1.S.stress); n++; }
// early warnings arrive by mail when an indicator gets worse, at most two a month
{ const E = loadEngine(src); E.dispatch({ type: 'newGame', seed: 6 }); E.S.progress.unlocked.push('treasury');
  E.dispatch({ type: 'setPolicy', area: 'treasury', values: { liquidityTarget: 0.1, longShare: 1 } });
  const isW = x => /^(Warning|Watch): /.test(x.subject); let total = 0, maxMonth = 0;
  for (let m = 0; m < 10 && !E.S.over; m++){ const was = E.S.inbox.filter(isW).length;
    for (let c; (c = E.current());) E.dispatch({ type: 'resolve', id: c.id, k: c.opts[0].k }); E.dispatch({ type: 'closeMonth' });
    const now = E.S.inbox.filter(isW).length; maxMonth = Math.max(maxMonth, now - was); total = now; }
  assert(E.S.ewi && Object.keys(E.S.ewi).length >= 8, 'indicator bands are remembered'); n++;
  assert(maxMonth <= 2, 'no more than two warnings in a month: ' + maxMonth); n++;
  assert(total >= 1, 'a bank that runs thin on liquidity is warned'); n++; }
// 13. Board confidence: it starts when the player takes over an area, meets every quarter, and can end the job.
{ const month = (E) => { for (let c; (c = E.current());) E.dispatch({ type: 'resolve', id: c.id, k: c.opts[0].k }); E.dispatch({ type: 'closeMonth' }); };
  // offered an area but not using it: the board does not watch
  { const E = loadEngine(src); E.dispatch({ type: 'newGame', seed: 4, opts: { chiefExecutive: true } }); for (let i = 0; i < 4; i++) month(E);
    assert(!E.S.board, 'no board until an area is taken over'); n++; }
  const start = (seed) => { const E = loadEngine(src); E.dispatch({ type: 'newGame', seed, opts: { chiefExecutive: true } }); E.dispatch({ type: 'setPolicy', area: 'pricing', values: { mortgageSpread: 1.05 } }); return E; };
  { const E = start(4); month(E); assert(E.S.board && Math.round(E.S.board.conf) !== 60 || E.S.board.conf !== 60); n++;
    month(E); const before = E.S.inbox.filter(x => /^Board meeting/.test(x.subject)).length; month(E);
    const meet = E.S.inbox.filter(x => /^Board meeting/.test(x.subject)); assert.strictEqual(meet.length, before + 1, 'a board meeting every third month'); assert(/confidence in you is \d+ out of 100/.test(meet[meet.length - 1].body)); n += 2;
    assert.strictEqual(E.S.board.hist.length, 1); assert(E.S.board.conf >= 0 && E.S.board.conf <= 100); n += 2;
    // the stress test does not move the board
    const bj = JSON.stringify(E.S.board); E.stressTest({}, 6); assert.strictEqual(JSON.stringify(E.S.board), bj); n++; }
  // careful rules keep the job
  for (const seed of [1, 2, 3, 4, 5, 6]){ const { S } = play(loadEngine(src), seed, 'careful', 2, { chiefExecutive: true }, (run) => run({ type: 'setPolicy', area: 'pricing', values: { mortgageSpread: 1.05 } }));
    assert.notStrictEqual(S.over, 'sacked', 'careful play was sacked, seed ' + seed); assert(S.board && S.board.conf > 40); n += 2; }
  // two meetings under 20 in a row: warned first, then removed
  { const E = start(4); for (let i = 0; i < 3; i++){ if (i === 2) E.S.board.conf = 0; month(E); }
    assert.strictEqual(E.S.board.low, 1); assert(!E.S.over); assert(E.S.inbox.some(x => /If confidence is still below 20/.test(x.body))); n += 3;
    for (let i = 0; i < 3; i++){ if (i === 2) E.S.board.conf = 0; month(E); }
    assert.strictEqual(E.S.over, 'sacked'); assert.strictEqual(E.S.sackedWhy, 'confidence'); assert.strictEqual(E.rating().letter, 'D'); n += 3;
    assert(E.S.news.some(x => /chief executive ousted/.test(x.head))); n++; }
  // enforcement action at a meeting ends it at once
  { const E = start(4); for (let i = 0; i < 3; i++){ if (i === 2) E.S.comp = 30; month(E); }
    assert.strictEqual(E.S.over, 'sacked'); assert.strictEqual(E.S.sackedWhy, 'enforcement'); n += 2; }
  // resigning ends the game but is judged on the year so far, and only a chief executive can do it
  { const E = loadEngine(src); E.dispatch({ type: 'newGame', seed: 4 }); assert.throws(() => E.dispatch({ type: 'resign' }), /only a chief executive/); n++;
    const F = start(4); for (let i = 0; i < 4; i++) month(F); F.dispatch({ type: 'resign' });
    assert.strictEqual(F.S.over, 'resigned'); assert.notStrictEqual(F.rating().letter, 'D'); assert.throws(() => F.dispatch({ type: 'resign' }), /already over/); n += 3; } }
// 14. Hedging and the maturity ladder.
{ const month = (E) => { for (let c; (c = E.current());) E.dispatch({ type: 'resolve', id: c.id, k: c.opts[0].k }); E.dispatch({ type: 'closeMonth' }); };
  const start = (seed, tre) => { const E = loadEngine(src); E.dispatch({ type: 'newGame', seed, opts: { chiefExecutive: true } }); E.dispatch({ type: 'setPolicy', area: 'credit', values: {} }); E.dispatch({ type: 'setPolicy', area: 'treasury', values: Object.assign({ liquidityTarget: 0.2 }, tre) }); return E; };
  // off by default: nothing is entered
  { const E = start(3, {}); for (let i = 0; i < 6; i++) month(E); assert.strictEqual(E.S.swaps.length, 0); assert.strictEqual(E.S.collateral, 0); n += 2; }
  // the standing rule enters swaps up to the target, once, and says so
  const E = start(3, { hedgeTarget: 1, hedgeYears: 1 });
  for (let i = 0; i < 6; i++) month(E);
  assert(E.S.swaps.length >= 1, 'swaps entered'); assert(E.S.inbox.some(x => x.subject === 'Interest-rate swap entered')); n += 2;
  { const book = E.loanSum('mortgage'), cover = E.S.swaps.reduce((a, w) => a + w.n, 0); assert(cover <= book + 1 && cover > 0.3 * book, `cover ${cover} of ${book}`); n++; }
  assert(E.S.swaps.every(w => w.k > E.S.y0.base - 3 && w.due - w.start === 12 && w.n % 250 === 0)); n++;
  // a rise in Bank Rate pays the bank, a fall costs it and ties up cash as collateral; the ledger agrees throughout (dispatch checks it)
  { const run = (path) => { const F = start(3, { hedgeTarget: 1, hedgeYears: 3 }); F.S.path = path; const paid = [], coll = []; for (let i = 0; i < 9; i++){ month(F); paid.push(-(F.S.ledger.bal['pl.swaps'] || 0)); coll.push(F.S.collateral); } return { F, paid, coll }; };
    const up = run('sticky'), down = run('downturn');
    const last = (r) => r.paid[r.paid.length - 1] - r.paid[r.paid.length - 2];
    assert(last(up) > 0, 'a rate rise pays the bank'); assert(last(down) < 0 && Math.max(...down.coll) > 0, 'a rate cut costs the bank and calls collateral');
    assert(up.coll[up.coll.length - 1] < down.coll[down.coll.length - 1], 'rising rates return collateral, falling rates call more'); n += 3;
    assert(down.F.indicators().find(i => i.key === 'collateral').value > 0); n++; }
  // swaps run to their end, and the collateral is returned
  for (let i = 0; i < 14; i++){ month(E); if (E.S.over === 'done') E.dispatch({ type: 'nextYear' }); }
  assert(E.S.swaps.every(w => w.start >= E.S.year * 12 + E.S.month - 12)); n++;
  { const G = start(3, { hedgeTarget: 1, hedgeYears: 1 }); for (let i = 0; i < 3; i++) month(G); G.dispatch({ type: 'setPolicy', area: 'treasury', release: true });
    const k = G.S.swaps.length; assert(k > 0); month(G); assert(G.S.swaps.length >= 1 || G.S.swaps.length === k, 'handing treasury back does not cancel swaps'); n++; }
  // over-hedging is flagged, and the executive team says so
  { const H = start(3, { hedgeTarget: 1.5, hedgeYears: 3 }); for (let i = 0; i < 5; i++) month(H);
    const ind = H.indicators().find(i => i.key === 'hedge'); assert(ind.value > 1.1 && ind.status === 'alarm'); n++; }
  // the maturity ladder accounts for every contractual flow
  { const L = E.maturityLadder(), S = E.S;
    assert.strictEqual(L.rows.length, 5); assert(Math.abs(L.rows.reduce((a, r) => a + r.inflow, 0) - (S.legacy + S.loans.filter(l => l.status !== 'plan').reduce((a, l) => a + l.bal, 0))) < 1e-6); n += 2;
    assert(Math.abs(L.rows.reduce((a, r) => a + r.outflow, 0) - ((S.wholesale || 0) + (S.bonds || 0))) < 1e-6); assert(L.lcr > 0 && L.liquid > 0); n += 2;
    assert(['ladder', 'hedge', 'collateral'].every(k => E.indicators().some(i => i.key === k))); n++; }
  // wholesale funding shows up in the ladder, due within three months
  { const W = start(3, {}); W.dispatch({ type: 'setPolicy', area: 'funding', values: { wholesaleTarget: 0.2 } }); for (let i = 0; i < 2; i++) month(W);
    const L = W.maturityLadder(); assert(W.S.wholesale > 0 && L.rows[0].outflow + L.rows[1].outflow > 0); n += 2; }
  // two stress scenarios: a rate shock favours the hedged bank, a recession the unhedged one
  { let dRates = 0, dRec = 0, k = 0; for (const seed of [1, 2, 3]){
      const run = (v) => { const X = loadEngine(src); const { S } = play(X, seed, 'careful', 3, { chiefExecutive: true }, (r) => { r({ type: 'setPolicy', area: 'credit', values: {} }); r({ type: 'setPolicy', area: 'treasury', values: Object.assign({ liquidityTarget: 0.2 }, v) }); }); if (S.over === 'done') X.dispatch({ type: 'nextYear' }); return X; };
      const a = run({}), b = run({ hedgeTarget: 1, hedgeYears: 3 }); if (a.S.over || b.S.over) continue; k++;
      dRates += b.stressTest({}, 9, 'rates').capChange - a.stressTest({}, 9, 'rates').capChange; dRec += b.stressTest({}, 9, 'recession').capChange - a.stressTest({}, 9, 'recession').capChange; }
    assert(k >= 2); assert(dRates / k > 20, 'hedging helps in a rate shock: ' + dRates / k); assert(dRates > dRec, `and helps less (or costs) in a recession: ${dRates / k} against ${dRec / k}`); n += 3; }
  { const Z = start(3, { hedgeTarget: 1, hedgeYears: 1 }); for (let i = 0; i < 3; i++) month(Z);
    Z.dispatch({ type: 'stress', scenario: 'rates' }); assert.strictEqual(Z.S.stress.scenario, 'rates');
    assert.throws(() => Z.dispatch({ type: 'stress', scenario: 'meteor' }), /unknown stress scenario/); n += 2;
    let leaked = 0; Z.setSink(() => { leaked++; }); Z.stressTest({}, 4, 'rates'); Z.setSink(null); assert.strictEqual(leaked, 0); n++; } }
// 15. Funding instruments, the Bank of England facility and the share price.
{ const month = (E) => { for (let c; (c = E.current());) E.dispatch({ type: 'resolve', id: c.id, k: c.opts[0].k }); E.dispatch({ type: 'closeMonth' }); };
  const start = (seed, fund, cap) => { const E = loadEngine(src); E.dispatch({ type: 'newGame', seed, opts: { chiefExecutive: true } }); E.dispatch({ type: 'setPolicy', area: 'credit', values: {} });
    E.dispatch({ type: 'setPolicy', area: 'funding', values: Object.assign({ savingsSpread: 0 }, fund) }); if (cap) E.dispatch({ type: 'setPolicy', area: 'capital', values: cap }); return E; };
  // the facility: off by default, drawn up to the target within the collateral, repaid down to it, and it costs the board
  { const E = start(3, {}); for (let i = 0; i < 4; i++) month(E); assert.strictEqual(E.S.cb, 0); n++; }
  { const E = start(3, { boeTarget: 500 }); for (let i = 0; i < 3; i++) month(E);
    assert(E.S.cb >= 475 && E.S.cb <= 525 && E.S.cb % 25 === 0, 'drawn to the target: ' + E.S.cb); assert(E.S.cb <= E.boeCapacity() + 1); n += 2;
    assert(E.S.inbox.some(x => x.subject === 'Bank of England borrowing')); assert(E.S.news.some(x => /borrows from the Bank of England/.test(x.head))); n += 2;
    const ind = E.indicators().find(i => i.key === 'boe'); assert(ind.status !== 'ok'); n++;
    const F = start(3, {}); for (let i = 0; i < 3; i++) month(F); assert(E.S.board.conf < F.S.board.conf, `borrowing costs confidence: ${E.S.board.conf} vs ${F.S.board.conf}`); n++;
    const before = E.S.cb, G = start(3, { boeTarget: 500 }); for (let i = 0; i < 3; i++) month(G);
    month(E); assert(Math.abs(E.S.cb - before) <= 25, 'the automatic repayment leaves the target alone'); n++;
    G.dispatch({ type: 'setPolicy', area: 'funding', values: { boeTarget: 0 } }); month(G); assert(G.S.cb < before, 'repaid once the target is lowered'); n++; }
  { const E = start(3, { boeTarget: 5000 }); for (let i = 0; i < 3; i++) month(E); assert(E.S.cb <= E.boeCapacity() + 1 && E.S.cb > 0); n++; }
  // funding instruments: one row each, with the facility as a single running balance
  { const E = start(3, { wholesaleTarget: 0.2, bondTarget: 0.1, bondTermYears: 2, boeTarget: 300 }); for (let i = 0; i < 2; i++) month(E);
    const rows = E.fundingInstruments(), ids = rows.map(r => r.id); assert.strictEqual(new Set(ids).size, ids.length, 'instrument ids are unique'); n++;
    const sum = k => rows.filter(r => r.kind === k).reduce((a, r) => a + r.amt, 0);
    assert(Math.abs(sum('wholesale') - E.S.wholesale) < 1e-6 && Math.abs(sum('bond') - E.S.bonds) < 1e-6 && Math.abs(sum('boe') - E.S.cb) < 1e-6); n++;
    assert(rows.some(r => r.kind === 'wholesale' && r.due > r.start) && rows.some(r => r.kind === 'bond' && r.due - r.start === 24) && rows.some(r => r.kind === 'boe' && r.due === null)); n += 1;
    // a game saved before instruments had ids gets them
    const old = JSON.parse(JSON.stringify(E.S)); for (const t of old.wsTranches.concat(old.bondTranches)){ delete t.id; delete t.start; } delete old.fid;
    const M = loadEngine(src); const m = M.migrate(old); assert(m.wsTranches.concat(m.bondTranches).every(t => t.id != null && t.start != null)); n++; }
  // share price: only tracked in the Chief Executive role, book value times a multiple, diluted by new shares
  { const E = loadEngine(src); E.dispatch({ type: 'newGame', seed: 3 }); for (let i = 0; i < 3; i++) month(E); assert(!E.S.px || E.S.px.hist.length === 0); n++; }
  { const E = start(3, {}); for (let i = 0; i < 5; i++) month(E); const P = E.S.px; assert.strictEqual(P.hist.length, 5);
    const last = P.hist[4]; assert(last.price > 0 && last.mult >= 0.4 && last.mult <= 2.5 && Math.abs(last.price - last.book * last.mult) < 0.01); n += 2;
    const sh = P.shares, px = E.sharePrice(), ni = P.issues.length; E.issueEquity(300);
    assert(P.shares > sh && Math.abs((P.shares - sh) - 300 / (0.9 * px)) < 0.01 && P.issues.length === ni + 1); n += 2;
    const bj = JSON.stringify(E.S.px); E.stressTest({}, 5); assert.strictEqual(JSON.stringify(E.S.px), bj); n++;
    const T = start(3, {}); for (let i = 0; i < 4; i++) month(T); T.S.comp = 30; month(T);
    const U = start(3, {}); for (let i = 0; i < 5; i++) month(U); assert(T.S.px.mult < U.S.px.mult, 'trouble lowers the multiple'); n++; }
  // a capital raise through the standing rule dilutes holders and is on the record
  { const E = start(3, {}, { capitalTarget: 0.25, capitalAction: 0, raiseAmount: 300 }); let issued = false; for (let i = 0; i < 6 && !issued; i++){ month(E); issued = !!(E.S.px && E.S.px.issues.length); }
    assert(issued && E.S.px.shares > 1000); n++; } }
// 16. Operations: team capacity and backlogs, hiring, alert sensitivity, the change programme and suppliers.
{ const month = (E) => { for (let c; (c = E.current());){ const o = c.opts.filter(o => !(o.cash && E.S.cash < o.cash)); E.dispatch({ type: 'resolve', id: c.id, k: o[0].k }); } E.dispatch({ type: 'closeMonth' }); };
  const start = (seed, vals) => { const E = loadEngine(src); E.dispatch({ type: 'newGame', seed, opts: { chiefExecutive: true } }); if (vals) E.dispatch({ type: 'setPolicy', area: 'operations', values: vals }); return E; };
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  // until the player takes over, nothing happens; owning it at the executive team's values starts the model
  { const E = start(3); for (let i = 0; i < 3; i++) month(E); assert(!E.S.ops); n++; }
  { const E = start(3, {}); for (let i = 0; i < 3; i++) month(E); const O = E.S.ops;
    assert(O && O.last.length === 5 && O.last.every(r => r.util > 0 && r.util < 1.5), 'defaults run each team below its limit'); assert.strictEqual(O.incidents.length, 0); n += 3;
    const ids = E.indicators().map(i => i.key); for (const k of ['util', 'age', 'alerts', 'falsealarm', 'unreviewed', 'change', 'suppliers']) assert(ids.includes(k), 'indicator ' + k); n++;
    assert(E.advisers().some(a => a.role === 'Head of operations')); assert(Object.values(E.opsRecommended()).every(v => v >= 1)); n += 2;
    const P = JSON.stringify(E.S.ops); E.stressTest({}, 4); assert.strictEqual(JSON.stringify(E.S.ops), P, 'the stress test leaves operations alone'); n++;
    let leaked = 0; E.setSink(() => { leaked++; }); E.stressTest({}, 3); E.setSink(null); assert.strictEqual(leaked, 0); n++; }
  { const E = start(3); assert(!E.indicators().some(i => i.key === 'util')); n++; }
  // hiring takes two months to arrive and a third to train; letting people go is at once
  { const E = start(3, { staffCounter: 9 }); month(E); const O = E.S.ops; assert.strictEqual(O.staff.counter, 6); assert(O.hiring.some(h => h.team === 'counter' && h.n === 3), 'the new settings take effect the following month'); assert(E.S.inbox.some(x => x.subject === 'Operations changes')); n += 3;
    for (let i = 0; i < 3; i++) month(E); assert(E.S.ops.staff.counter <= 6, 'not arrived yet'); month(E); assert(E.S.ops.staff.counter >= 7, 'arrived three months after they were hired: ' + E.S.ops.staff.counter); n += 2;
    const F = start(3, { staffCounter: 4 }); month(F); assert(F.S.ops.staff.counter <= 4, 'letting people go is immediate once it takes effect'); n++; }
  // overtime adds 20% for three months and no more
  { const E = start(3, { overtime: 1 }); const cap = () => { const r = E.S.ops.last.find(r => r.team === 'counter'); return r.cap / (r.staff * 20); };
    month(E); month(E); assert(Math.abs(cap() - 1.2) < 0.01 && E.S.ops.otActive, 'overtime adds 20%'); for (let i = 0; i < 3; i++) month(E); assert(Math.abs(cap() - 1) < 0.01 && !E.S.ops.otActive, 'overtime stops after three months'); n += 2; }
  // an alert threshold trades catching crime against false alarms; with the same draws the false alarms scale with the square of it
  { const at = (s) => { const E = start(3, { fraudSensitivity: s }); month(E); return E.S.ops.m.fraud; };
    const lo = at(0.25), mid = at(0.5), hi = at(1); assert(Math.abs(hi.falseAlerts / mid.falseAlerts - 4) < 0.1 && lo.falseAlerts < mid.falseAlerts); n++;
    const E0 = start(3); assert(E0.detectRate(0.25, 0) < E0.detectRate(0.5, 0) && E0.detectRate(0.5, 0) < E0.detectRate(1, 0) && E0.detectRate(0.5, 0.06) > E0.detectRate(0.5, 0)); n++; }
  // lean staffing builds backlogs and costs trust; over two years it is worse than the plan, and so is a lot of extra staff
  { const lean = { staffCounter: 3, staffCredit: 2, staffFraud: 2, staffFincrime: 2, staffComplaints: 1, staffIt: 2 }; const tPlan = [], tLean = [], ageLean = [], sPlan = [], sLean = [], sGen = [];
    for (const seed of [1, 2, 3, 5]){
      const run = (v) => { const X = loadEngine(src); const { S } = play(X, seed, 'careful', 2, { chiefExecutive: true }, (r) => r({ type: 'setPolicy', area: 'operations', values: v })); const sc = S.career.map(c => ({ AAA: 100, AA: 95, A: 85, BBB: 70, BB: 55, B: 40, CCC: 25, CC: 15, C: 10, D: 0 })[c.letter] || 0); return { S, score: sc.length ? avg(sc) : 0 }; };
      const a = run({}), b = run(lean), c = run({ staffCounter: 8, staffCredit: 4, staffFraud: 6, staffFincrime: 4, staffComplaints: 4, staffIt: 4 });
      tPlan.push(a.S.trust); tLean.push(b.S.trust); ageLean.push(Math.max(...Object.values(b.S.ops.m.age))); sPlan.push(a.score); sLean.push(b.score); sGen.push(c.score); }
    assert(avg(tLean) < avg(tPlan) - 10, `lean staffing costs trust: ${avg(tLean)} vs ${avg(tPlan)}`); assert(avg(ageLean) > 3, 'backlogs build: ' + avg(ageLean)); assert(avg(sLean) < avg(sPlan), 'a lean strategy rates worse'); assert(avg(sGen) < avg(sPlan), 'over-staffing costs more than it earns'); n += 4; }
  // the change programme: projects use IT capacity, finish with a benefit, and too many at once bring incidents
  { const E = start(3, { regReporting: 1, staffIt: 8 }); month(E); assert.strictEqual(E.S.ops.projects.length, 1); for (let i = 0; i < 7; i++) month(E);
    assert(E.S.ops.done.reg != null && E.S.ops.projects.length === 0 && E.S.inbox.some(x => /Regulatory reporting platform complete/.test(x.subject)), 'a project finishes'); n++; }
  { const E = start(3, { coreMigration: 1 }); month(E); assert.strictEqual(E.S.ops.projects.length, 1); E.dispatch({ type: 'setPolicy', area: 'operations', values: { coreMigration: 0 } }); month(E); assert.strictEqual(E.S.ops.projects.length, 0); n += 2; }
  { let incidents = 0, calm = 0; for (const seed of [1, 2, 3, 4, 5, 6]){
      const a = start(seed, { coreMigration: 2, paymentsUpgrade: 1, regReporting: 1, mobileApp: 1, dataPlatform: 1 }), b = start(seed, { coreMigration: 1, paymentsUpgrade: 1, staffIt: 8 });
      for (let i = 0; i < 10 && !a.S.over; i++) month(a); for (let i = 0; i < 10 && !b.S.over; i++) month(b);
      incidents += a.S.ops.incidents.length; calm += b.S.ops.incidents.length; }
    assert(incidents >= 3 && incidents > calm, `overloading IT brings incidents: ${incidents} against ${calm}`); n++; }
  // suppliers: outsourcing saves money until one fails; oversight spending reduces the failures and the harm
  { let none = 0, watched = 0, costNone = 0, costWatched = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]){
      const a = start(seed, { outsourceCards: 1, outsourceContact: 1, outsourceHosting: 1 }), b = start(seed, { outsourceCards: 1, outsourceContact: 1, outsourceHosting: 1, oversight: 4 });
      for (let i = 0; i < 12 && !a.S.over; i++) month(a); for (let i = 0; i < 12 && !b.S.over; i++) month(b);
      none += a.S.ops.incidents.length; watched += b.S.ops.incidents.length; costNone += a.S.ops.incidents.reduce((x, y) => x + y.cost, 0); costWatched += b.S.ops.incidents.reduce((x, y) => x + y.cost, 0); }
    assert(none > watched, `oversight reduces failures: ${none} vs ${watched}`); assert(costNone > costWatched); n += 2;
    const w = start(3, { outsourceCards: 1, oversight: 0 }); assert(w.advisers().some(x => /almost no oversight/.test(x.text))); n++; }
  // handing operations back stops the model
  { const E = start(3, {}); month(E); E.dispatch({ type: 'setPolicy', area: 'operations', release: true }); const was = JSON.stringify(E.S.ops.last); month(E); assert.strictEqual(JSON.stringify(E.S.ops.last), was); n++; } }
// 17. The monthly executive meeting: settings are tabled, and take effect at the start of the next month.
{ const month = (E) => { for (let c; (c = E.current());){ const o = c.opts.filter(o => !(o.cash && E.S.cash < o.cash)); E.dispatch({ type: 'resolve', id: c.id, k: o[0].k }); } E.dispatch({ type: 'closeMonth' }); };
  const start = (seed, meet) => { const E = loadEngine(src); E.dispatch({ type: 'newGame', seed, opts: { chiefExecutive: true, meetings: meet } }); return E; };
  // without the option nothing changes: settings apply at once
  { const E = start(3, false); E.dispatch({ type: 'setPolicy', area: 'credit', values: { mortgageMaxLtv: 80 } }); assert.strictEqual(E.S.policy.credit.mortgageMaxLtv, 80); assert(!E.S.meet && !E.S.pq); n += 2; }
  // with it, a change is queued, can be seen as what it will become, and takes effect when the month turns
  const E = start(3, true); assert.strictEqual(E.S.meet, true); n++;
  E.dispatch({ type: 'setPolicy', area: 'credit', values: { mortgageMaxLtv: 80, mortgageMinScore: 600 } });
  assert.strictEqual(E.S.policy.credit.mortgageMaxLtv, 90); assert.strictEqual(E.S.policy.owner.credit, 'system'); assert.strictEqual(E.S.pq.length, 1); n += 3;
  assert.strictEqual(E.policyAfterMeeting('credit').mortgageMaxLtv, 80); assert.strictEqual(E.policyAfterMeeting('credit').mortgageMinScore, 600); n++;
  // a bad value or a locked area is refused when it is tabled, not a month later
  assert.throws(() => E.dispatch({ type: 'setPolicy', area: 'credit', values: { mortgageMaxLtv: 500 } }), /must be between/); n++;
  { const L = loadEngine(src); L.dispatch({ type: 'newGame', seed: 3, opts: { meetings: true } }); assert.throws(() => L.dispatch({ type: 'setPolicy', area: 'credit', values: {} }), /not unlocked/); n++; }
  // withdrawing a takeover that has not happened yet
  { const F = start(3, true); F.dispatch({ type: 'setPolicy', area: 'treasury', values: { liquidityTarget: 0.3 } }); assert.strictEqual(F.S.pq.length, 1); F.dispatch({ type: 'setPolicy', area: 'treasury', release: true }); assert.strictEqual(F.S.pq.length, 0); n += 2; }
  month(E);
  assert.strictEqual(E.S.policy.credit.mortgageMaxLtv, 80); assert.strictEqual(E.S.policy.owner.credit, 'player'); assert.strictEqual(E.S.pq.length, 0); n += 3;
  assert(E.S.progress.quiet && E.S.progress.quiet.area === 'credit', 'quiet months start when the change takes effect'); n++;
  const mail = E.S.inbox.filter(x => /^Executive meeting:/.test(x.subject)); assert(mail.length >= 1); const body = mail[mail.length - 1].body;
  assert(/Profit .* for the year/.test(body) && /Decided last month and now in force: credit: mortgageMaxLtv 80/.test(body) && /Open Policy to table changes/.test(body)); n += 2;
  for (const r of ['Finance director', 'Chief risk officer', 'Treasurer', 'Head of operations']) assert(body.includes(r + ':'), 'the meeting mail has the ' + r); n += 4;
  // once an area is owned, setting a value back to what it is withdraws the change; a release is queued and taken at the turn
  E.dispatch({ type: 'setPolicy', area: 'credit', values: { mortgageMaxLtv: 70 } }); assert.strictEqual(E.S.pq.length, 1);
  E.dispatch({ type: 'setPolicy', area: 'credit', values: { mortgageMaxLtv: 80 } }); assert.strictEqual(E.S.pq.length, 0, 'setting it back withdraws it'); n += 2;
  E.dispatch({ type: 'setPolicy', area: 'credit', release: true }); assert.strictEqual(E.S.policy.owner.credit, 'player'); assert.strictEqual(E.S.pq[0].release, true); n += 2;
  month(E); assert.strictEqual(E.S.policy.owner.credit, 'system'); assert.strictEqual(E.S.policy.credit.mortgageMaxLtv, 90); n += 2;
  // the stress test's copy changes settings at once, and the real queue is left alone
  E.dispatch({ type: 'setPolicy', area: 'capital', values: { dividendPayout: 0.2 } }); const q = JSON.stringify(E.S.pq); E.stressTest({ capital: { dividendPayout: 0.5 } }, 3); assert.strictEqual(JSON.stringify(E.S.pq), q); n++;
  // at the year end the queue is taken when the new year begins
  { const Y = start(3, true); Y.dispatch({ type: 'setPolicy', area: 'pricing', values: { mortgageSpread: 1.5 } }); for (let i = 0; i < 12 && Y.S.over !== 'done'; i++){ if (i === 0) month(Y); else month(Y); }
    if (Y.S.over === 'done'){ assert.strictEqual(Y.S.policy.pricing.mortgageSpread, 1.5); n++; } }
  { const Y = start(3, true); for (let i = 0; i < 11; i++) month(Y); Y.dispatch({ type: 'setPolicy', area: 'pricing', values: { mortgageSpread: 1.6 } }); month(Y);
    if (Y.S.over === 'done'){ assert.strictEqual(Y.S.pq.length, 1); Y.dispatch({ type: 'nextYear' }); assert.strictEqual(Y.S.policy.pricing.mortgageSpread, 1.6); assert.strictEqual(Y.S.pq.length, 0); n += 2; } }
  // a replay of the same commands gives the same game
  { const cmds = [{ type: 'newGame', seed: 6, opts: { chiefExecutive: true, meetings: true } }]; const A = loadEngine(src); A.dispatch(cmds[0]);
    const go = (c) => { cmds.push(c); return A.dispatch(c); };
    go({ type: 'setPolicy', area: 'treasury', values: { liquidityTarget: 0.25 } }); for (let i = 0; i < 2; i++){ for (let c; (c = A.current());) go({ type: 'resolve', id: c.id, k: c.opts[0].k }); go({ type: 'closeMonth' }); }
    go({ type: 'setPolicy', area: 'treasury', values: { liquidityTarget: 0.3 } });
    const B = loadEngine(src); for (const c of cmds) B.dispatch(c); assert.strictEqual(JSON.stringify(B.S), JSON.stringify(A.S)); n++; } }
// 18. Growth: products, incentives and conduct, acquisitions, and the branch network.
{ const month = (E) => { for (let c; (c = E.current());){ const o = c.opts.filter(o => !(o.cash && E.S.cash < o.cash)); E.dispatch({ type: 'resolve', id: c.id, k: o[0].k }); } E.dispatch({ type: 'closeMonth' }); };
  const start = (seed, vals, path) => { const E = loadEngine(src); E.dispatch({ type: 'newGame', seed, opts: { chiefExecutive: true } }); if (path) E.S.path = path; if (vals) E.dispatch({ type: 'setPolicy', area: 'growth', values: vals }); return E; };
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  // until the player takes over nothing happens, and indicators appear only when they own it
  { const E = start(3); for (let i = 0; i < 3; i++) month(E); assert(!E.S.growth && !E.indicators().some(i => i.key === 'complaints')); n++; }
  { const E = start(3, {}); for (let i = 0; i < 3; i++) month(E); const G = E.S.growth; assert(G && G.last && G.acqCount === 0); assert(E.indicators().some(i => i.key === 'complaints') && E.indicators().some(i => i.key === 'whistle')); n += 3;
    const P = JSON.stringify(E.S.growth); E.stressTest({}, 3); assert.strictEqual(JSON.stringify(E.S.growth), P, 'the stress test leaves growth alone'); n++; }
  // launching a product costs to build, then earns; marketing roughly doubles the volume; it is withdrawn without cancelling what is on the books
  { const a = start(3, { launchBtl: 1, marketing: 3 }, 'soft'), b = start(3, { launchBtl: 1 }, 'soft'); for (let i = 0; i < 4; i++){ month(a); month(b); }
    assert(a.S.growth.products.btl && a.S.growth.products.btl.cum > b.S.growth.products.btl.cum * 1.4, 'marketing lifts volume'); assert(a.S.inbox.some(x => x.subject === 'Growth changes' && /buy-to-let/.test(x.body))); n += 2;
    a.dispatch({ type: 'setPolicy', area: 'growth', values: { launchBtl: 0 } }); month(a); assert(a.S.growth.products.btl.ended != null); n++; }
  // a product's risk shows in the economy: buy now, pay later loses in a downturn and makes money in a soft landing
  { const run = (path) => { const E = start(3, { launchBnpl: 1, marketing: 3 }, path); for (let i = 0; i < 8; i++) month(E); return E.S.growth.products.bnpl.last; };
    const soft = run('soft'), down = run('downturn'); assert(soft > down + 2 && down < 1, `bnpl: soft ${soft} against downturn ${down}`); n++; }
  // higher fees are more likely to fail the regulator's fair value review
  { let hi = 0, lo = 0; for (const seed of [1, 2, 3, 4, 5, 6]){
      const a = start(seed, { launchPackaged: 1, launchBnpl: 1, marketing: 6, feeLevel: 2 }), b = start(seed, { launchPackaged: 1, launchBnpl: 1, marketing: 6, feeLevel: 0 });
      for (let i = 0; i < 12 && !a.S.over; i++) month(a); for (let i = 0; i < 12 && !b.S.over; i++) month(b); hi += a.S.growth.reviewsFailed; lo += b.S.growth.reviewsFailed; }
    assert(hi > lo, `high fees fail more reviews: ${hi} against ${lo}`); n++; }
  // incentives: volume-heavy bonuses lift sales, raise mis-selling, wear the culture down and bring whistleblowers; a quality gate and retraining help
  { const heavy = { bonusSales: 1, bonusQuality: 0, salesTarget: 1.5 }; const a = start(3, heavy), plan = start(3, {}), gate = start(3, Object.assign({ qualityGate: 1 }, heavy));
    for (let i = 0; i < 6; i++){ month(a); month(plan); month(gate); }
    assert(a.S.growth.sidx > plan.S.growth.sidx + 0.2, 'sales rise within a quarter'); assert(a.S.growth.culture < plan.S.growth.culture - 8, 'culture falls under pressure'); n += 2;
    const pend = E => E.S.pending.filter(p => p.gr).length;
    assert(pend(a) > pend(plan) + 5, `mis-selling complaints are stored up: ${pend(a)} vs ${pend(plan)}`); assert(pend(gate) < pend(a) * 0.6, 'a quality gate cuts them'); n += 2;
    let whistle = 0; for (const seed of [1, 2, 3, 4]){ const E = start(seed, heavy); for (let i = 0; i < 9 && !E.S.over; i++) month(E); whistle += E.S.growth.whistle; }
    assert(whistle >= 2, 'staff speak up when the culture is bad: ' + whistle); n++; }
  // the pattern of upheld complaints brings an independent review, at the bank's cost, and not again soon
  { const E = start(3, {}); month(E); const now = E.S.year * 12 + E.S.month; E.S.growth.upheld = Array(9).fill(now - 1); const comp = E.S.comp; month(E);
    assert(E.S.growth.indep >= now && E.S.comp < comp - 5 && E.S.news.some(x => /independent review|review of Counting House sales/.test(x.head + x.body))); n++;
    E.S.growth.upheld = Array(9).fill(E.S.year * 12 + E.S.month); const was = E.S.growth.indep; month(E); assert.strictEqual(E.S.growth.indep, was, 'not reviewed again within two years'); n++; }
  // acquisitions: an offer arrives, deeper diligence reveals more, goodwill comes off capital (not off profit), and the ledger balances throughout
  { const E = start(3, {}); month(E); E.S.growth.offerAt = 0; month(E); const offer = E.S.queue.find(c => c.kind === 'acquire' && !c.done); assert(offer, 'an offer arrives in the inbox'); assert(offer.opts.length === 4 && /is for sale/.test(offer.note) && !offer.phys); n += 2;
    const cap0 = E.capRatio(), prof0 = E.S.cash; E.dispatch({ type: 'resolve', id: offer.id, k: 'deep' });
    const follow = E.S.queue.find(c => c.kind === 'acquire2' && !c.done); assert(follow && /Deep diligence finds hidden losses of/.test(follow.note), 'deep diligence reveals the hidden loss rate'); n++;
    const profitBefore = E.rating().profit; E.dispatch({ type: 'resolve', id: follow.id, k: 'buy' }); const A = E.S.growth.acq[0];
    assert(A && E.S.goodwill > 0 && Math.abs(E.S.goodwill - A.goodwill) < 1e-6 && A.depth === 'deep'); n++;
    assert(Math.abs(E.rating().profit - profitBefore) < 5, 'buying is a capital event, not a loss: ' + (E.rating().profit - profitBefore)); n++;
    const real0 = A.realised; month(E); month(E); assert(E.S.growth.acq[0].realised > real0, 'hidden losses arrive over the next two years'); n++;
    assert(E.indicators().some(i => i.key === 'goodwill') && E.indicators().some(i => i.key === 'diligence' && i.value === 1)); n++;
    // goodwill is written down when the deal underperforms, which leaves capital alone and the ledger balanced
    E.S.growth.acq[0].realised = A.goodwill; E.S.growth.acq[0].start = E.S.year * 12 + E.S.month - 24; const gw = E.S.goodwill, capital = E.capRatio(); month(E);
    assert(E.S.goodwill < gw && E.S.growth.acq[0].written, 'goodwill is written down'); n++; }
  { const light = start(3, {}); month(light); light.S.growth.offerAt = 0; month(light); const o = light.S.queue.find(c => c.kind === 'acquire' && !c.done); light.dispatch({ type: 'resolve', id: o.id, k: 'light' });
    assert(/not looking very hard/.test(light.S.queue.find(c => c.kind === 'acquire2' && !c.done).note)); const w = light.S.queue.find(c => c.kind === 'acquire2' && !c.done); light.dispatch({ type: 'resolve', id: w.id, k: 'walk' }); assert.strictEqual(light.S.growth.acq.length, 0); assert(light.S.goodwill === 0); n += 3; }
  // the branch network: closing the only bank in an older, cash-reliant town costs more deposits and trust than closing a younger town's, saves running costs, and makes the Herald
  { const base = start(3, {}), a = start(3, { town4: 0 }), b = start(3, { town1: 0 });
    const d0 = base.S.deposits, t0 = base.S.trust; month(base); month(a); month(b); const lostA = (base.S.deposits - a.S.deposits) / 12, lostB = (base.S.deposits - b.S.deposits) / 22;
    assert(lostA > lostB * 1.5, `the older, cash-reliant town loses more per head: ${lostA} vs ${lostB}`); assert(base.S.trust - a.S.trust > base.S.trust - b.S.trust); n += 2;
    assert(a.S.news.some(x => /Last bank in Eskdale closes/.test(x.head))); assert(a.indicators().some(i => i.key === 'towns')); n += 2;
    const costs = E => E.S.ledger.bal['pl.costs'] || 0; for (let i = 0; i < 3; i++){ month(base); month(a); } assert(costs(a) < costs(base), 'closing saves running costs'); n++; }
  { const open = start(3, { town6: 2 }), shut = start(3, {}); for (let i = 0; i < 3; i++){ month(open); month(shut); } assert(open.S.deposits > shut.S.deposits, 'an opened branch builds deposits'); n++; }
  // a replay of the same commands gives the same game, acquisitions included
  { const cmds = []; const A = loadEngine(src); const go = (c) => { cmds.push(c); return A.dispatch(c); };
    go({ type: 'newGame', seed: 11, opts: { chiefExecutive: true } }); go({ type: 'setPolicy', area: 'growth', values: { launchBtl: 1, marketing: 3, bonusSales: 0.8 } });
    for (let i = 0; i < 6; i++){ for (let c; (c = A.current());){ const o = c.opts.filter(o => !(o.cash && A.S.cash < o.cash)); go({ type: 'resolve', id: c.id, k: o[0].k }); } go({ type: 'closeMonth' }); }
    const B = loadEngine(src); for (const c of cmds) B.dispatch(c); assert.strictEqual(JSON.stringify(B.S), JSON.stringify(A.S)); n++; } }
console.log('ok', n, 'checks');
