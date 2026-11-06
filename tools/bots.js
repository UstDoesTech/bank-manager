// Bots that play through the command interface. They read the hidden truth on each card (c.h), so they model
// "perfect information" play; the noisy bots add human-like mistakes. None of them touch the game's own random stream.
const first = (c, ...keys) => { for (const k of keys) if (c.opts.some(o => o.k === k)) return k; return c.opts[0].k; };

// What a careful player with full information would do on each card kind.
function oracle(c, E, wealth){
  const h = c.h;
  switch (c.kind){
    case 'onboard':  return first(c, h.bad ? 'no' : 'open');
    case 'mortgage': { const r = E.mortgageRisk(h); return first(c, r.pd < 0.05 && r.aff < 0.4 ? 'yes' : 'no'); }
    case 'fraud':    return first(c, h.fraud ? 'block' : 'let');
    case 'personal': return first(c, h.pd < 0.035 ? 'low' : h.pd < 0.12 ? 'high' : 'no');
    case 'aml':      return first(c, h.guilty ? 'sar' : 'none');
    case 'business': return first(c, h.pd < 0.08 ? 'yes' : 'no');
    case 'treasury': return first(c, 'short');
    case 'card':     return first(c, h.persist ? 'plan' : 'keep');
    case 'product':  return first(c, 'no');
    case 'app':      return first(c, h.scam ? 'stop' : 'send');
    case 'rate':     return first(c, 'full');
    case 'hardship': return first(c, 'plan');
    case 'sanctions':return first(c, h.real ? 'freeze' : 'release');
    case 'outage':   return first(c, 'pay');
    case 'capital':  return first(c, 'raise');
    case 'liqshock': return first(c, 'raise');
    case 'complaint':return first(c, h.valid ? 'refund' : 'reject');
    case 'wmLaunch': return first(c, wealth ? 'build' : 'no');
    case 'wmHouse':  return first(c, 'no');
    case 'wmCampaign': return first(c, 'no');
    case 'wmPep':    return first(c, h.bad ? 'no' : 'yes');
    case 'wmClient': return first(c, E.LEVELS[h.suit]);
    case 'wmMarket': return first(c, 'call');
    case 'wmVuln':   return first(c, h.scam ? 'refuse' : 'pay');
    default:         return c.opts[0].k;
  }
}
// Once a month, buy staff and systems when the bank can comfortably afford them.
function invest(E, run){
  for (const u of E.UPGRADES) {
    if (u.flag || E.owned(u.key)) continue;
    if (E.S.cash > u.cost + 2500 && E.capRatio() > 0.14) { run({ type: 'buy', key: u.key }); }
  }
}
const BOTS = {
  careful:      { choose: (c, E)    => oracle(c, E, false), month: invest },
  carefulPlain: { choose: (c, E)    => oracle(c, E, false) },
  wealth:       { choose: (c, E)    => oracle(c, E, true),  month: invest },
  noisy10:      { choose: (c, E, r) => r() < 0.10 ? c.opts[Math.floor(r() * c.opts.length)].k : oracle(c, E, true), month: invest },
  noisy25:      { choose: (c, E, r) => r() < 0.25 ? c.opts[Math.floor(r() * c.opts.length)].k : oracle(c, E, false) },
  // approves almost everything and chases yield: should fail, and fail in different ways from "first"
  greedy:       { choose: (c, E, r) => { const k = oracle(c, E, true); return ['mortgage','personal','business','onboard'].includes(c.kind) ? first(c, 'yes', 'high', 'open') : k; } },
};
module.exports = { BOTS, oracle };
