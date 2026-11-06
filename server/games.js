'use strict';
const crypto = require('crypto');
const { HttpError } = require('./auth');

const PENCE_PER_K = 1e5;                  // the engine counts £ thousands; the database counts pence
const COMMANDS = new Set(['newGame', 'resolve', 'closeMonth', 'nextYear', 'buy', 'read', 'setPolicy']);

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
  } else if (cmd.type === 'setPolicy') {
    if (state.over) throw new HttpError(409, 'game_over', 'The year is over.');
    if (!['pricing', 'credit', 'treasury', 'funding', 'capital'].includes(cmd.area)) throw new HttpError(400, 'bad_command', 'Unknown policy area.');
    if (!state.progress.unlocked.includes(cmd.area)) throw new HttpError(403, 'not_unlocked', 'You do not control that policy yet.');
    if (!cmd.release && (!cmd.values || typeof cmd.values !== 'object' || Array.isArray(cmd.values))) throw new HttpError(400, 'bad_command', 'Missing values.');
  } else if (cmd.type === 'read') {
    if (typeof cmd.key !== 'string' || !/^[cm]\d+$/.test(cmd.key)) throw new HttpError(400, 'bad_command', 'Bad message key.');
  }
}

// Only these fields of a command are kept, so a client cannot smuggle extra data into the replay source.
function cleanCommand(cmd) {
  const out = { type: cmd.type };
  if (cmd.type === 'resolve') { out.id = cmd.id; out.k = cmd.k; }
  if (cmd.type === 'buy' || cmd.type === 'read') out.key = cmd.key;
  if (cmd.type === 'setPolicy') { out.area = cmd.area; out.values = cmd.values; if (cmd.release) out.release = true; }
  if (cmd.type === 'newGame') { out.seed = cmd.seed; out.opts = cmd.opts || {}; }
  return out;
}

const pence = (k) => Math.round(k * PENCE_PER_K);

// Keeps party, agreement and collateral in step with the engine's loan book. New loans are inserted, balances and
// status are refreshed, and a loan that has left the book is closed: sold if it was still performing, otherwise
// written off. The engine ids are the keys, so a replay produces the same rows.
async function syncBook(client, gid, at, loans) {
  const rows = loans.map((l) => ({ id: l.id, name: l.name, kind: l.kind === 'business' ? 'business' : 'person', product: l.kind,
    rate: l.rate, pd: l.pd, bal: pence(l.bal), status: l.status, guar: !!l.guar, ggs: !!l.ggs,
    prop: l.prop != null ? pence(l.prop) : null, ltv: l.ltv != null ? l.ltv : null }));
  const json = JSON.stringify(rows);
  await client.query(
    `INSERT INTO bank.party (game_id, party_id, name, kind)
     SELECT $1, r.id, r.name, r.kind FROM json_to_recordset($2::json) AS r(id int, name text, kind text)
     ON CONFLICT DO NOTHING`, [gid, json]);
  await client.query(
    `INSERT INTO bank.agreement (game_id, agreement_id, party_id, product, opened_year, opened_month, rate_pct, pd, principal_pence, balance_pence, status, guaranteed, government_backed)
     SELECT $1, r.id, r.id, r.product, $3, $4, r.rate, r.pd, r.bal, r.bal, r.status, r.guar, r.ggs
     FROM json_to_recordset($2::json) AS r(id int, product text, rate numeric, pd numeric, bal bigint, status text, guar boolean, ggs boolean)
     ON CONFLICT (game_id, agreement_id) DO UPDATE SET balance_pence = EXCLUDED.balance_pence, status = EXCLUDED.status, pd = EXCLUDED.pd
       WHERE (bank.agreement.balance_pence, bank.agreement.status, bank.agreement.pd) IS DISTINCT FROM (EXCLUDED.balance_pence, EXCLUDED.status, EXCLUDED.pd)`,
    [gid, json, at.year, at.month]);
  await client.query(
    `INSERT INTO bank.collateral (game_id, agreement_id, kind, value_pence, ltv_pct)
     SELECT $1, r.id, 'residential_property', r.prop, r.ltv FROM json_to_recordset($2::json) AS r(id int, prop bigint, ltv numeric)
     WHERE r.prop IS NOT NULL ON CONFLICT DO NOTHING`, [gid, json]);
  await client.query(
    `UPDATE bank.agreement SET closed_year = $3, closed_month = $4,
       outcome = CASE WHEN status = 'current' THEN 'sold' ELSE 'written_off' END, status = 'closed'
     WHERE game_id = $1 AND status <> 'closed' AND agreement_id <> ALL (SELECT (jsonb_array_elements($2::jsonb)->>'id')::int)`,
    [gid, json, at.year, at.month]);
}

// Keeps the household cast and each closed month of their money in step with the engine.
async function syncHouseholds(client, gid, at, households) {
  const cast = JSON.stringify(households.map((h) => ({ id: h.id, name: h.name, stage: h.stage, label: h.label, goal: h.goal })));
  await client.query(
    `INSERT INTO bank.household (game_id, household_id, name, stage, label, goal)
     SELECT $1, r.id, r.name, r.stage, r.label, r.goal FROM json_to_recordset($2::json) AS r(id int, name text, stage text, label text, goal text)
     ON CONFLICT (game_id, household_id) DO UPDATE SET stage = EXCLUDED.stage, label = EXCLUDED.label`, [gid, cast]);
  const rows = households.map((h) => ({ h, e: h.hist.find((x) => x.y === at.year && x.m === at.month) })).filter((r) => r.e)
    .map(({ h, e }) => ({ id: h.id, income: Math.round(e.income * 100), spend: Math.round(e.spend * 100), saved: Math.round(e.saved * 100), debt: Math.round(e.debt * 100), score: e.score, fund: e.fund }));
  if (rows.length)
    await client.query(
      `INSERT INTO bank.household_month (game_id, household_id, year, month, income_pence, spending_pence, saved_pence, debt_pence, credit_score, fund_months)
       SELECT $1, r.id, $3, $4, r.income, r.spend, r.saved, r.debt, r.score, r.fund
       FROM json_to_recordset($2::json) AS r(id int, income bigint, spend bigint, saved bigint, debt bigint, score int, fund numeric)`,
      [gid, JSON.stringify(rows), at.year, at.month]);
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

  await syncBook(client, gid, before || { year: state.year, month: state.month }, state.loans || []);
  if (state.households && cmd.type === 'closeMonth') await syncHouseholds(client, gid, before, state.households);
  if (cmd.type === 'closeMonth') {
    for (const c of facts.cohorts)
      await client.query(
        `INSERT INTO bank.portfolio_cohort (game_id, year, month, product, risk_band, issued, loans, balance_pence, rate_pct, pd, lgd,
           expected_loss_pence, rwa_pence, current_pence, days_30_pence, days_60_pence, plan_pence)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [gid, before.year, before.month, c.product, c.band, c.issued, c.n, pence(c.bal), c.rate, c.pd, c.lgd, pence(c.expectedLoss), pence(c.rwa),
          pence(c.buckets.current), pence(c.buckets.d30), pence(c.buckets.d60), pence(c.buckets.plan)]);
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
    if (body.households && !opts.tutorial && !opts.scenario) opts.households = true;
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
    if (req.player.guest) throw new HttpError(403, 'guest_cannot_delete', 'Guest games cannot be deleted. Create an account to manage your games.');
    const r = await pool.query('DELETE FROM bank.game WHERE id = $1 AND player_key = $2', [req.params.id, req.player.player_key]);
    if (!r.rowCount) throw new HttpError(404, 'not_found', 'No such game.');
    return { ok: true };
  });
}

module.exports = { register, toPence, validate, cleanCommand };
