'use strict';
const crypto = require('crypto');
const { HttpError } = require('./auth');

const PENCE_PER_K = 1e5;                  // the engine counts £ thousands; the database counts pence
const COMMANDS = new Set(['newGame', 'resolve', 'closeMonth', 'nextYear', 'buy', 'read']);

// Converts one engine journal entry to whole pence. Rounding each line can leave the entry off by a penny or two,
// so the difference goes on the largest line and the stored entry sums to exactly zero.
function toPence(lines) {
  const amounts = lines.map(([, d]) => Math.round(d * PENCE_PER_K));
  const drift = -amounts.reduce((t, x) => t + x, 0);
  if (Math.abs(drift) > lines.length) throw new Error('journal entry cannot be rounded to pence: off by ' + drift);
  if (drift) {
    let big = 0;
    amounts.forEach((x, i) => { if (Math.abs(x) > Math.abs(amounts[big])) big = i; });
    amounts[big] += drift;
  }
  return lines.map(([account], i) => [account, amounts[i]]);
}

// Checks a command against the current state before the engine sees it.
function validate(state, cmd) {
  if (!cmd || !COMMANDS.has(cmd.type) || cmd.type === 'newGame') throw new HttpError(400, 'bad_command', 'Unknown command.');
  if (cmd.type === 'resolve') {
    if (state.over) throw new HttpError(409, 'game_over', 'The year is over.');
    const c = state.queue.find((x) => x.id === cmd.id);
    if (!c) throw new HttpError(422, 'no_such_card', 'No such card.');
    if (c.done) throw new HttpError(409, 'already_resolved', 'That case is already decided.');
    const o = c.opts.find((x) => x.k === cmd.k);
    if (!o) throw new HttpError(422, 'no_such_option', 'That is not one of the options.');
    if (o.cash && state.cash < o.cash) throw new HttpError(422, 'cannot_afford', 'The bank cannot afford that.');
  } else if (cmd.type === 'closeMonth') {
    if (state.over) throw new HttpError(409, 'game_over', 'The year is over.');
  } else if (cmd.type === 'nextYear') {
    if (state.over !== 'done') throw new HttpError(409, 'year_not_finished', 'The year is not finished.');
  } else if (cmd.type === 'buy') {
    if (state.over) throw new HttpError(409, 'game_over', 'The year is over.');
    if (typeof cmd.key !== 'string') throw new HttpError(400, 'bad_command', 'Missing upgrade key.');
  } else if (cmd.type === 'read') {
    if (typeof cmd.key !== 'string' || !/^[cm]\d+$/.test(cmd.key)) throw new HttpError(400, 'bad_command', 'Bad message key.');
  }
}

// Only these fields of a command are kept, so a client cannot smuggle extra data into the replay source.
function cleanCommand(cmd) {
  const out = { type: cmd.type };
  if (cmd.type === 'resolve') { out.id = cmd.id; out.k = cmd.k; }
  if (cmd.type === 'buy' || cmd.type === 'read') out.key = cmd.key;
  if (cmd.type === 'newGame') { out.seed = cmd.seed; out.opts = cmd.opts || {}; }
  return out;
}

// Writes everything one command produced. The caller holds the transaction.
async function persist(client, game, seq, cmd, before, out) {
  const { state, result, entries, facts } = out;
  const gid = game.id;
  await client.query('INSERT INTO bank.command (game_id, seq, type, payload) VALUES ($1, $2, $3, $4)', [gid, seq, cmd.type, JSON.stringify(cmd)]);

  // journal: entries, then lines, so the deferred balance check sees whole entries at commit
  for (const e of entries) {
    await client.query('INSERT INTO bank.journal_entry (game_id, seq, command_seq, year, month, memo) VALUES ($1, $2, $3, $4, $5, $6)',
      [gid, e.seq, seq, e.year, e.month, e.memo]);
    const lines = toPence(e.lines);
    const values = [], params = [];
    lines.forEach(([account, pence], i) => { params.push(gid, e.seq, i + 1, account, pence); values.push(`($${params.length - 4}, $${params.length - 3}, $${params.length - 2}, $${params.length - 1}, $${params.length})`); });
    await client.query(`INSERT INTO bank.journal_line (game_id, entry_seq, line_no, account, amount_pence) VALUES ${values.join(',')}`, params);
  }

  if (cmd.type === 'resolve') {
    const card = before.card;
    await client.query(
      `INSERT INTO bank.decision (game_id, command_seq, card_id, kind, year, month, options, chosen, truth)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [gid, seq, card.id, card.kind, before.year, before.month,
        JSON.stringify(card.opts.map((o) => ({ k: o.k, l: o.l }))), cmd.k, JSON.stringify(card.h || {})]);
    for (const l of (result && result.lines) || [])
      await client.query('INSERT INTO bank.event (game_id, command_seq, year, month, kind, tone, text) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [gid, seq, before.year, before.month, 'outcome', l.tone || '', l.t]);
  }
  if (cmd.type === 'closeMonth') {
    for (const l of (result && result.events) || [])
      await client.query('INSERT INTO bank.event (game_id, command_seq, year, month, kind, tone, text) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [gid, seq, before.year, before.month, 'month', l.tone || '', l.t]);
    await client.query(
      `INSERT INTO bank.position_snapshot (game_id, year, month, account, balance_pence)
       SELECT game_id, $2, $3, account, SUM(amount_pence) FROM bank.journal_line WHERE game_id = $1 GROUP BY game_id, account`,
      [gid, before.year, before.month]);
    await client.query(
      `INSERT INTO bank.regulatory_snapshot (game_id, year, month, capital_ratio, liquidity_ratio, trust, regulator, profit_pence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [gid, before.year, before.month, facts.cap, facts.liq, facts.trust, facts.comp, Math.round(result.profit * PENCE_PER_K)]);
  }

  const status = facts.over === 'done' ? 'finished' : facts.over ? 'failed' : 'active';
  await client.query(
    `INSERT INTO bank.game_state (game_id, seq, state) VALUES ($1, $2, $3)
     ON CONFLICT (game_id) DO UPDATE SET seq = EXCLUDED.seq, state = EXCLUDED.state, updated_at = now()`, [gid, seq, JSON.stringify(state)]);
  await client.query('UPDATE bank.game SET last_seq = $2, status = $3, updated_at = now() WHERE id = $1', [gid, seq, status]);
  return status;
}

function register(app, { pool, host }) {
  const auth = { preHandler: app.requireAuth };

  async function inTransaction(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const r = await fn(client);
      await client.query('COMMIT');
      return r;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally { client.release(); }
  }

  app.post('/api/games', auth, async (req, reply) => {
    const p = req.player;
    if (!p.consent_at) throw new HttpError(409, 'consent_required', 'Read and accept the recording notice first.');
    const body = req.body || {};
    const opts = {};
    if (body.tutorial) opts.tutorial = true;
    if (body.scenario) opts.scenario = String(body.scenario);
    const seed = crypto.randomInt(1, 0x7fffffff);
    const cmd = { type: 'newGame', seed, opts };
    let out;
    try { out = host.apply(null, cmd); } catch (e) { throw new HttpError(422, 'bad_game', 'Could not start that game.'); }
    const game = await inTransaction(async (client) => {
      const g = (await client.query(
        `INSERT INTO bank.game (player_key, mode, scenario, tutorial, seed, engine_version, in_analysis)
         VALUES ($1, 'branch', $2, $3, $4, $5, $6) RETURNING id`,
        [p.player_key, opts.scenario || null, !!opts.tutorial, seed, host.version, !p.analysis_opt_out])).rows[0];
      await persist(client, g, 1, cmd, { year: out.state.year, month: out.state.month }, out);
      return g;
    });
    reply.code(201);
    return { id: game.id, seq: 1, seed, engineVersion: host.version, state: out.state };
  });

  app.get('/api/games', auth, async (req) => {
    const { rows } = await pool.query(
      `SELECT id, mode, scenario, tutorial, status, last_seq AS seq, created_at, updated_at
         FROM bank.game WHERE player_key = $1 ORDER BY updated_at DESC LIMIT 50`, [req.player.player_key]);
    return { games: rows };
  });

  app.get('/api/games/:id', auth, async (req) => {
    const { rows } = await pool.query(
      `SELECT g.id, g.seed, g.engine_version, g.status, g.scenario, g.tutorial, s.seq, s.state
         FROM bank.game g JOIN bank.game_state s ON s.game_id = g.id
        WHERE g.id = $1 AND g.player_key = $2`, [req.params.id, req.player.player_key]);
    if (!rows[0]) throw new HttpError(404, 'not_found', 'No such game.');
    const r = rows[0];
    return { id: r.id, seed: r.seed, engineVersion: r.engine_version, status: r.status, seq: r.seq, state: r.state };
  });

  // The body carries the sequence number the client believes is next. A repeat or a gap is refused, so a retried
  // request cannot apply twice and commands always arrive in order.
  app.post('/api/games/:id/commands', auth, async (req) => {
    const body = req.body || {};
    const cmd = body.command && typeof body.command === 'object' ? cleanCommand(body.command) : null;
    if (!Number.isInteger(body.seq)) throw new HttpError(400, 'bad_command', 'Missing sequence number.');
    return inTransaction(async (client) => {
      const g = (await client.query(
        'SELECT id, last_seq, engine_version FROM bank.game WHERE id = $1 AND player_key = $2 FOR UPDATE', [req.params.id, req.player.player_key])).rows[0];
      if (!g) throw new HttpError(404, 'not_found', 'No such game.');
      if (g.engine_version !== host.version) throw new HttpError(409, 'engine_changed', 'This game was recorded with another engine version.');
      if (body.seq !== g.last_seq + 1) {
        const e = new HttpError(409, 'out_of_sequence', 'Out of sequence.'); e.extra = { expected: g.last_seq + 1 }; throw e;
      }
      const state = (await client.query('SELECT state FROM bank.game_state WHERE game_id = $1', [g.id])).rows[0].state;
      validate(state, cmd);
      const card = cmd.type === 'resolve' ? state.queue.find((x) => x.id === cmd.id) : null;
      const before = { year: state.year, month: state.month, card };
      let out;
      try { out = host.apply(state, cmd); } catch (e) { req.log.error(e); throw new HttpError(422, 'engine_error', 'The engine could not apply that command.'); }
      if (cmd.type === 'buy' && !out.result) throw new HttpError(422, 'cannot_buy', 'That cannot be bought now.');
      const status = await persist(client, g, body.seq, cmd, before, out);
      return { seq: body.seq, status, result: out.result, state: out.state };
    });
  });

  // Ledger view derived purely from the stored journal: the trial balance must always be zero.
  app.get('/api/games/:id/ledger', auth, async (req) => {
    const own = await pool.query('SELECT 1 FROM bank.game WHERE id = $1 AND player_key = $2', [req.params.id, req.player.player_key]);
    if (!own.rows[0]) throw new HttpError(404, 'not_found', 'No such game.');
    const { rows } = await pool.query(
      `SELECT l.account, a.name, SUM(l.amount_pence)::bigint AS pence
         FROM bank.journal_line l JOIN bank.gl_account a ON a.code = l.account
        WHERE l.game_id = $1 GROUP BY l.account, a.name ORDER BY l.account`, [req.params.id]);
    const total = rows.reduce((t, r) => t + Number(r.pence), 0);
    return { accounts: rows.map((r) => ({ account: r.account, name: r.name, pence: Number(r.pence) })), trialBalancePence: total };
  });

  app.delete('/api/games/:id', auth, async (req) => {
    const r = await pool.query('DELETE FROM bank.game WHERE id = $1 AND player_key = $2', [req.params.id, req.player.player_key]);
    if (!r.rowCount) throw new HttpError(404, 'not_found', 'No such game.');
    return { ok: true };
  });
}

module.exports = { register, toPence, validate };
