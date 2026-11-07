'use strict';
// Rebuilds a game from its seed, engine version and ordered commands, then compares the result with what was stored:
// the latest state, every journal entry (in pence) and the decision records. Usage: node server/replay.js <game id>
const { toPence, validate } = require('./games');

const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.keys(x).sort().reduce((o, key) => { o[key] = x[key]; return o; }, {}) : x));

async function verifyGame(pool, host, gameId) {
  const problems = [];
  const g = (await pool.query('SELECT * FROM bank.game WHERE id = $1', [gameId])).rows[0];
  if (!g) return { ok: false, problems: ['no such game'] };
  if (g.engine_version !== host.version) return { ok: false, problems: [`game was recorded with engine ${g.engine_version}, this is ${host.version}`] };
  const cmds = (await pool.query('SELECT seq, payload FROM bank.command WHERE game_id = $1 ORDER BY seq', [gameId])).rows;
  cmds.forEach((c, i) => { if (c.seq !== i + 1) problems.push(`command sequence gap at ${i + 1}`); });

  let state = null, entries = [], decisions = 0;
  for (const c of cmds) {
    if (c.payload.type === 'resolve') decisions++;
    try {
      // each command must be one the live server would have accepted at that point
      if (c.payload.type !== 'newGame') validate(state, c.payload);
      const out = host.apply(state, c.payload);
      state = out.state;
      entries = entries.concat(out.entries);
    } catch (e) {
      problems.push(`command ${c.seq} (${c.payload.type}) cannot be replayed: ${e.message}`);
      return { ok: false, problems, commands: cmds.length, entries: entries.length };
    }
  }

  const stored = (await pool.query('SELECT state, seq FROM bank.game_state WHERE game_id = $1', [gameId])).rows[0];
  if (!stored) problems.push('no stored state');
  else {
    if (stored.seq !== cmds.length) problems.push(`stored state is at command ${stored.seq}, there are ${cmds.length} commands`);
    if (canon(stored.state) !== canon(state)) problems.push('replayed state differs from the stored state');
  }

  // the loan book tables must agree with the replayed loans: same open agreements, balances and statuses
  if (state) {
    const open = new Map((await pool.query("SELECT agreement_id, balance_pence, status FROM bank.agreement WHERE game_id = $1 AND status <> 'closed'", [gameId])).rows.map((r) => [r.agreement_id, r]));
    if (open.size !== state.loans.length) problems.push(`${open.size} open agreements, replay has ${state.loans.length} loans`);
    for (const l of state.loans) {
      const a = open.get(l.id);
      if (!a) problems.push(`loan ${l.id} has no open agreement`);
      else if (Number(a.balance_pence) !== Math.round(l.bal * 1e5) || a.status !== l.status) problems.push(`agreement ${l.id} differs from the replayed loan`);
    }
  }

  if (state) {
    const hs = (await pool.query("SELECT count(*)::int AS n, count(*) FILTER (WHERE status = 'active')::int AS live FROM bank.hedge WHERE game_id = $1", [gameId])).rows[0];
    if (hs.n !== (state.swapId || 0)) problems.push(`${hs.n} stored swaps, replay entered ${state.swapId || 0}`);
    if (hs.live !== (state.swaps || []).length) problems.push(`${hs.live} active swaps stored, replay has ${(state.swaps || []).length}`);
  }

  if (state) {
    const live = (await pool.query("SELECT count(*)::int AS n FROM bank.funding_instrument WHERE game_id = $1 AND status = 'active'", [gameId])).rows[0].n;
    const want = (state.wsTranches || []).length + (state.bondTranches || []).length + ((state.cb || 0) > 0.005 ? 1 : 0);
    if (live !== want) problems.push(`${live} active funding instruments stored, replay has ${want}`);
    if (state.px && state.px.hist.length && state.px.hist.length < 36) {
      const sp = (await pool.query('SELECT count(*)::int AS n FROM bank.share_price WHERE game_id = $1', [gameId])).rows[0].n;
      if (sp !== state.px.hist.length) problems.push(`${sp} stored share prices, replay has ${state.px.hist.length}`);
    }
  }

  if (state && state.households) {
    const rows = (await pool.query('SELECT household_id, credit_score, year, month FROM bank.household_month WHERE game_id = $1 ORDER BY year, month', [gameId])).rows;
    for (const h of state.households) {
      const mine = rows.filter((x) => x.household_id === h.id), last = h.hist[h.hist.length - 1];
      if (mine.length !== h.hist.length && h.hist.length < 36) problems.push(`household ${h.name} has ${mine.length} stored months, replay has ${h.hist.length}`);
      if (last && mine.length && mine[mine.length - 1].credit_score !== last.score) problems.push(`household ${h.name}'s stored credit score differs from the replay`);
    }
  }

  const lines = (await pool.query(
    'SELECT entry_seq, line_no, account, amount_pence FROM bank.journal_line WHERE game_id = $1 ORDER BY entry_seq, line_no', [gameId])).rows;
  const byEntry = new Map();
  for (const l of lines) { if (!byEntry.has(l.entry_seq)) byEntry.set(l.entry_seq, []); byEntry.get(l.entry_seq).push([l.account, Number(l.amount_pence)]); }
  if (byEntry.size !== entries.length) problems.push(`journal has ${byEntry.size} entries, replay produced ${entries.length}`);
  for (const e of entries) {
    const want = toPence(e.lines), got = byEntry.get(e.seq);
    if (!got || canon(want) !== canon(got)) problems.push(`journal entry ${e.seq} (${e.memo}) differs`);
  }
  const total = lines.reduce((t, l) => t + Number(l.amount_pence), 0);
  if (total !== 0) problems.push(`trial balance is ${total} pence, not zero`);

  const d = (await pool.query('SELECT count(*)::int AS n FROM bank.decision WHERE game_id = $1', [gameId])).rows[0].n;
  if (d !== decisions) problems.push(`${d} decisions stored, ${decisions} resolve commands`);
  return { ok: problems.length === 0, problems, commands: cmds.length, entries: entries.length };
}

module.exports = { verifyGame };

if (require.main === module) {
  const config = require('./config');
  const { createPool } = require('./db');
  const { createHost } = require('./engine-host');
  const pool = createPool(config.databaseUrl);
  const ids = process.argv.slice(2);
  (async () => {
    const list = ids.length ? ids : (await pool.query('SELECT id FROM bank.game')).rows.map((r) => r.id);
    let bad = 0;
    for (const id of list) {
      const r = await verifyGame(pool, createHost(), id);
      console.log(r.ok ? 'OK  ' : 'FAIL', id, r.ok ? `${r.commands} commands, ${r.entries} entries` : r.problems.join('; '));
      if (!r.ok) bad++;
    }
    await pool.end();
    process.exit(bad ? 1 : 0);
  })();
}
