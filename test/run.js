const fs = require('fs'), path = require('path'), assert = require('assert');
const { loadEngine, play, hashState, POLICIES, ALL } = require('../tools/harness');
const src = fs.readFileSync(path.join(__dirname, '..', 'engine', 'engine.js'), 'utf8');
const golden = JSON.parse(fs.readFileSync(path.join(__dirname, 'golden.json'), 'utf8'));
let n = 0;
// 1. Behaviour is unchanged against snapshots from the original engine (all bots, scenarios, tutorial).
const IGNORE = ['engine', 'progress', 'inbox', 'mailId'];
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
console.log('ok', n, 'checks');
