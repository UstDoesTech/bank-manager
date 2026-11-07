'use strict';
// Runs the shared game engine on the server. The engine keeps its state in one global, so a single instance is
// reused for every game: state is loaded, one command runs synchronously, and the new state is read straight back.
// Nothing awaits in between, so concurrent requests can never see each other's state.
const vm = require('vm'), fs = require('fs'), path = require('path');

function createHost(enginePath = path.join(__dirname, '..', 'engine', 'engine.js')) {
  const src = fs.readFileSync(enginePath, 'utf8');
  const ctx = vm.createContext({ console, Date });
  vm.runInContext(src + ';LEDGER_STRICT = true; this.E = { dispatch, ENGINE_VERSION, capRatio, liqRatio, metrics, rating, portfolio, maturityLadder, swapMTM, ' +
    'get S(){ return S }, set S(v){ S = v }, setSink(f){ LEDGER_SINK = f } };', ctx);
  const E = ctx.E;

  // Applies one command to a state (a plain object parsed from JSON). Returns the new state, the command's result,
  // the journal entries it produced and a few month-end facts. The state is re-parsed from JSON so that what runs
  // here is exactly what is stored: a replay does the same.
  function apply(state, cmd) {
    const entries = [];
    E.setSink((e) => entries.push(e));
    E.S = state;
    try {
      const before = state ? { year: state.year, month: state.month } : null;
      const result = E.dispatch(cmd);
      const next = E.S;
      const facts = { before, after: { year: next.year, month: next.month }, over: next.over || null,
        cap: E.capRatio(), liq: E.liqRatio(), trust: next.trust, comp: next.comp,
        cohorts: JSON.parse(JSON.stringify(E.portfolio())),
        ladder: cmd.type === 'closeMonth' ? JSON.parse(JSON.stringify(E.maturityLadder())) : null, mtm: next.swaps && next.swaps.length ? E.swapMTM() : 0 };
      return { state: JSON.parse(JSON.stringify(next)), result: cmd.type === 'newGame' ? null : result, entries, facts };
    } finally {
      E.setSink(null);
      E.S = null;
    }
  }
  return { apply, version: E.ENGINE_VERSION };
}

module.exports = { createHost };
