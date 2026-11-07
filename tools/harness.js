// Headless driver: loads an engine file in a sandbox and plays games through dispatch-style commands.
const vm = require('vm'), fs = require('fs'), crypto = require('crypto');
function loadEngine(src){
  const ctx = vm.createContext({ console, Date });
  vm.runInContext(src + ';LEDGER_STRICT=true;this.E={newGame,closeMonth,resolveCard,nextYear,buyUpgrade,current,rating,get S(){return S},set S(v){S=v},migrate,' +
    '...(typeof indicators==="function"?{indicators,advisers,runStress,stressTest,survivalHorizon,rateSensitivity,ceMode,maturityLadder,swapMTM,swapNotional,fundingInstruments,sharePrice,bookPerShare,boeCapacity,boeFacility,pxOf,issueEquity,opsOf,opsOwned,detectRate,PROJECT_DEFS,OPS_DEFAULT,opsRecommended,opsByPolicy,opsMonth,policyAfterMeeting,applyQueuedPolicy}:{}),' +
    '...(typeof portfolio==="function"?{portfolio,loanRW,loanSum,rwa,policyVerdict,systemPolicy,quietLeft,giltMV,giltBook,mkt}:{}),' +
    '...(typeof ledgerCheck==="function"?{ledgerCheck,setSink:f=>{LEDGER_SINK=f}}:{}),' +
    '...(typeof mortgageRisk==="function"?{mortgageRisk,LEVELS,UPGRADES,owned,capRatio,SCENARIOS}:{}),' +
    '...(typeof dispatch==="function"?{dispatch}:{})}', ctx);
  return ctx.E;
}
// small independent PRNG so bot choices never touch the game's own random stream
function prng(seed){ let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const { BOTS } = require('./bots');
const POLICIES = {
  first:  (c) => 0,                        // always the first (usually "approve") option
  last:   (c, r) => c.opts.length - 1,     // always the last (usually "decline")
  random: (c, r) => Math.floor(r() * c.opts.length),
  mixed:  (c, r) => (r() < 0.7 ? 0 : Math.floor(r() * c.opts.length)),
};
// Plays `years` years. Returns the command log and the final state. Uses E.dispatch when present, else the old direct calls.
function play(E, seed, policy, years = 2, opts = {}, setup = null){
  const r = prng(seed ^ 0x5bd1e995), cmds = [];
  const run = (cmd) => {
    cmds.push(cmd);
    if (E.dispatch) return E.dispatch(cmd);
    switch (cmd.type){
      case 'newGame': return E.newGame(cmd.seed, cmd.opts || {});
      case 'resolve': return E.resolveCard(E.S.queue.find(x => x.id === cmd.id), cmd.k);
      case 'closeMonth': return E.closeMonth();
      case 'nextYear': return E.nextYear();
      case 'buy': return E.buyUpgrade(cmd.key);
    }
  };
  run({ type: 'newGame', seed, opts });
  if (setup) setup(run, E);
  for (let y = 0; y < years; y++){
    while (!E.S.over){
      let c; while ((c = E.current())){
        const o = c.opts.filter(o => !(o.cash && E.S.cash < o.cash));
        let k;
        if (POLICIES[policy]) k = o[Math.min(o.length - 1, POLICIES[policy](c, r))].k;
        else { k = BOTS[policy].choose(c, E, r); if (!o.some(x => x.k === k)) k = o[0].k; }
        run({ type: 'resolve', id: c.id, k });
      }
      if (BOTS[policy] && BOTS[policy].month) BOTS[policy].month(E, run, r);
      run({ type: 'closeMonth' });
    }
    if (E.S.over !== 'done') break;
    if (y < years - 1) run({ type: 'nextYear' });
  }
  return { cmds, S: E.S };
}
// stable hash of state; ignore fields added by the refactor
function hashState(S, ignore = ['engine', 'progress']){
  const j = JSON.stringify(S, (k, v) => ignore.includes(k) && S && k in S ? undefined : v);
  return crypto.createHash('sha1').update(j).digest('hex');
}
const ALL = () => Object.keys(POLICIES).concat(Object.keys(BOTS));
module.exports = { loadEngine, play, hashState, POLICIES, BOTS, ALL };
