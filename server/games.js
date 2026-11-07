'use strict';
const crypto = require('crypto');
const { HttpError } = require('./auth');

const PENCE_PER_K = 1e5;                  // the engine counts £ thousands; the database counts pence
const COMMANDS = new Set(['newGame', 'resolve', 'closeMonth', 'nextYear', 'buy', 'read', 'setPolicy', 'stress', 'resign']);

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
    if (!['pricing', 'credit', 'treasury', 'funding', 'capital', 'operations', 'growth'].includes(cmd.area)) throw new HttpError(400, 'bad_command', 'Unknown policy area.');
    if (!state.progress.unlocked.includes(cmd.area)) throw new HttpError(403, 'not_unlocked', 'You do not control that policy yet.');
    if (!cmd.release && (!cmd.values || typeof cmd.values !== 'object' || Array.isArray(cmd.values))) throw new HttpError(400, 'bad_command', 'Missing values.');
  } else if (cmd.type === 'resign') {
    if (state.over) throw new HttpError(409, 'game_over', 'The game is already over.');
    if (!state.progress.unlocked.some((a) => ['pricing', 'credit', 'treasury', 'funding', 'capital', 'operations', 'growth'].includes(a))) throw new HttpError(403, 'not_unlocked', 'Only a chief executive can resign.');
  } else if (cmd.type === 'stress') {
    if (state.over) throw new HttpError(409, 'game_over', 'The year is over.');
    if (!state.progress.unlocked.some((a) => ['pricing', 'credit', 'treasury', 'funding', 'capital', 'operations', 'growth'].includes(a))) throw new HttpError(403, 'not_unlocked', 'The stress test comes with the Chief Executive role.');
    if (cmd.overrides != null && (typeof cmd.overrides !== 'object' || Array.isArray(cmd.overrides))) throw new HttpError(400, 'bad_command', 'Bad overrides.');
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
  if (cmd.type === 'stress'){ if (cmd.overrides) out.overrides = cmd.overrides; if (cmd.scenario && cmd.scenario !== 'recession') out.scenario = cmd.scenario; }
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

// Keeps the swaps in step with the engine: new ones inserted, ones that have run off marked ended.
async function syncHedges(client, gid, at, state) {
  const swaps = state.swaps || [];
  for (const w of swaps)
    await client.query(
      `INSERT INTO bank.hedge (game_id, swap_id, notional_pence, fixed_rate_pct, term_months, start_year, start_month)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
      [gid, w.id, pence(w.n), w.k, w.years * 12, Math.floor(w.start / 12), w.start % 12]);
  await client.query(
    "UPDATE bank.hedge SET status = 'ended' WHERE game_id = $1 AND status = 'active' AND swap_id <> ALL ($2::int[])", [gid, swaps.map((w) => w.id)]);
}

// Keeps the funding instruments in step with the engine: new ones inserted, balances refreshed, repaid ones marked.
async function syncFunding(client, gid, instruments) {
  for (const r of instruments)
    await client.query(
      `INSERT INTO bank.funding_instrument (game_id, instrument_id, kind, amount_pence, rate_pct, start_abs, maturity_abs)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (game_id, instrument_id) DO UPDATE SET amount_pence = EXCLUDED.amount_pence, rate_pct = EXCLUDED.rate_pct, status = 'active'`,
      [gid, r.id, r.kind, pence(r.amt), r.rate, r.start, r.due]);
  await client.query(
    "UPDATE bank.funding_instrument SET status = 'repaid', amount_pence = 0 WHERE game_id = $1 AND status = 'active' AND instrument_id <> ALL ($2::text[])", [gid, instruments.map((r) => r.id)]);
}

// Keeps operations in step with the engine: each team's month, the projects, incidents and suppliers.
async function syncOperations(client, gid, at, state, closing) {
  const O = state.ops; if (!O) return;
  for (const r of closing ? O.last || [] : [])
    await client.query(
      'INSERT INTO bank.team_month (game_id, year, month, team, staff, demand, capacity, backlog, utilisation) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING',
      [gid, at.year, at.month, r.team, r.staff, r.demand, r.cap, r.backlog, r.util]);
  for (const p of O.projects || [])
    await client.query(
      "INSERT INTO bank.change_project (game_id, project, mode, start_abs, months, cost_pence, status) VALUES ($1,$2,$3,$4,$5,$6,'running') ON CONFLICT DO NOTHING",
      [gid, p.key, p.mode, p.start, p.months, pence(p.cost)]);
  for (const [key, when] of Object.entries(O.done || {}))
    await client.query("UPDATE bank.change_project SET status = 'done' WHERE game_id = $1 AND project = $2", [gid, key]);
  await client.query("UPDATE bank.change_project SET status = 'stopped' WHERE game_id = $1 AND status = 'running' AND project <> ALL ($2::text[])", [gid, (O.projects || []).map((p) => p.key)]);
  for (const i of O.incidents || [])
    await client.query('INSERT INTO bank.incident (game_id, incident_id, year, month, kind, cause, cost_pence) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING', [gid, i.id, i.y, i.m, i.kind, i.cause, pence(i.cost)]);
  const pol = state.policy.operations;
  for (const [key, field] of [['cards', 'outsourceCards'], ['contact', 'outsourceContact'], ['hosting', 'outsourceHosting']])
    await client.query(
      `INSERT INTO bank.supplier (game_id, supplier, outsourced, oversight_pence, incidents) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (game_id, supplier) DO UPDATE SET outsourced = EXCLUDED.outsourced, oversight_pence = EXCLUDED.oversight_pence, incidents = EXCLUDED.incidents`,
      [gid, key, pol[field] > 0, pence(pol.oversight), (O.sup && O.sup[key]) || 0]);
}

// Keeps growth in step with the engine: products and their reviews, acquisitions, incentives and the branch network.
async function syncGrowth(client, gid, at, state, closing) {
  const G = state.growth; if (!G) return;
  for (const [key, p] of Object.entries(G.products || {}))
    await client.query(
      `INSERT INTO bank.product (game_id, product, start_abs, status, repriced, revenue_pence) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (game_id, product) DO UPDATE SET status = EXCLUDED.status, repriced = EXCLUDED.repriced, revenue_pence = EXCLUDED.revenue_pence`,
      [gid, key, p.start, p.ended == null ? 'live' : 'withdrawn', !!p.repriced, pence(p.cum || 0)]);
  for (const r of G.fvLog || [])
    await client.query('INSERT INTO bank.product_review (game_id, year, month, product, failed) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING', [gid, r.y, r.m, r.key, r.failed]);
  for (const a of G.acq || [])
    await client.query(
      `INSERT INTO bank.acquisition (game_id, acquisition_id, target, price_pence, book_pence, goodwill_pence, diligence, start_abs, hidden_loss_pct, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (game_id, acquisition_id) DO UPDATE SET status = EXCLUDED.status`,
      [gid, a.id, a.name, pence(a.price), pence(a.L), pence(a.goodwill), a.depth, a.start, a.hidden * 100, a.written ? 'written down' : (state.year * 12 + Math.min(state.month, 11)) - a.start < 24 ? 'integrating' : 'settled']);
  if (closing && G.last)
    await client.query('INSERT INTO bank.incentive_month (game_id, year, month, sales_index, mis_sold, culture, upheld_12m, sales) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING',
      [gid, at.year, at.month, G.last.salesIdx, G.last.mis, G.last.culture, G.last.upheld, G.last.sales]);
  const names = ['none', 'hub', 'branch'];
  for (const [town, st] of Object.entries(G.townState || {})) {
    const since = (G.townSince && G.townSince[town]) != null ? G.townSince[town] : 0;
    await client.query('INSERT INTO bank.branch_site (game_id, town, state, since_abs) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [gid, town, names[st], since]);
  }
}

// Keeps the analysis tables in step: policy changes, deposit accounts, party roles, and each month's market, gilts, risk measures,
// alerts, products and the year's result.
async function syncAnalytics(client, gid, at, state, facts, closing) {
  for (const e of state.policyLog || []) {
    if (e.release) await client.query("INSERT INTO bank.policy_setting (game_id, log_id, year, month, area, setting, value, owner) VALUES ($1,$2,$3,$4,$5,'*',NULL,'system') ON CONFLICT DO NOTHING", [gid, e.id, e.y, e.m, e.area]);
    else for (const [k, v] of Object.entries(e.values || {}))
      await client.query("INSERT INTO bank.policy_setting (game_id, log_id, year, month, area, setting, value, owner) VALUES ($1,$2,$3,$4,$5,$6,$7,'player') ON CONFLICT DO NOTHING", [gid, e.id, e.y, e.m, e.area, k, v]);
  }
  // deposit accounts: the retail pool, each large depositor, each bond, and each household's savings
  const accounts = [{ id: 'easy', kind: 'easy_access', bal: state.deposits - (state.large || []).reduce((a, d) => a + d.amt, 0), rate: state.savRate }];
  for (const d of state.large || []) accounts.push({ id: 'large-' + d.id, kind: 'large_deposit', bal: d.amt, rate: d.rate });
  for (const b of state.bondTranches || []) accounts.push({ id: 'bond-' + (b.id != null ? b.id : b.due + '-' + b.amt), kind: 'fixed_bond', bal: b.amt, rate: b.rate });
  for (const h of state.households || []) accounts.push({ id: 'hh-' + h.id, kind: 'household_savings', bal: (h.cash || 0) / 1000, rate: null });
  for (const a of accounts)
    await client.query(
      `INSERT INTO bank.account (game_id, account_id, kind, balance_pence, rate_pct) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (game_id, account_id) DO UPDATE SET balance_pence = EXCLUDED.balance_pence, rate_pct = EXCLUDED.rate_pct, status = 'active'`,
      [gid, a.id, a.kind, pence(a.bal), a.rate]);
  await client.query("UPDATE bank.account SET status = 'closed', balance_pence = 0 WHERE game_id = $1 AND status = 'active' AND account_id <> ALL ($2::text[])", [gid, accounts.map((a) => a.id)]);
  for (const l of state.loans || []) {
    await client.query("INSERT INTO bank.party_role (game_id, party_id, role) VALUES ($1,$2,'borrower') ON CONFLICT DO NOTHING", [gid, l.id]);
    if (l.guar) await client.query("INSERT INTO bank.party_role (game_id, party_id, role) VALUES ($1,$2,'guarantor') ON CONFLICT DO NOTHING", [gid, l.id]);
  }
  if (!closing || !facts.analytics) return;
  const A = facts.analytics, m = A.market, r = A.risk;
  await client.query('INSERT INTO bank.market_state (game_id, year, month, base_rate, unemployment, house_price_index, share_index, inflation, path) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING',
    [gid, at.year, at.month, m.base, m.unemp, m.hpi, m.mkt, m.infl, m.path]);
  for (const [i, g] of A.gilts.entries())
    await client.query('INSERT INTO bank.security_holding (game_id, year, month, holding, kind, nominal_pence, coupon_pct, duration_years, market_pence) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING',
      [gid, at.year, at.month, i + 1, g.kind, pence(g.amt), g.coupon, g.dur, pence(g.mv)]);
  await client.query(
    `INSERT INTO bank.risk_month (game_id, year, month, rate_sensitivity_pence, survival_horizon_days, lcr, wholesale_share, top10_depositor_share, loan_to_deposit, hedge_ratio, collateral_pence, change_meter, boe_pence)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT DO NOTHING`,
    [gid, at.year, at.month, pence(r.rateSensitivity), Math.round(r.horizon), r.lcr, r.wholesaleShare, r.top10Share, r.loanToDeposit, r.hedgeRatio, pence(r.collateral), r.changeMeter, pence(r.boe)]);
  const O = state.ops && state.ops.m;
  if (O) {
    await client.query("INSERT INTO bank.alert_month (game_id, year, month, kind, true_cases, caught, missed, false_alerts, unreviewed) VALUES ($1,$2,$3,'fraud',$4,$5,$6,$7,NULL) ON CONFLICT DO NOTHING",
      [gid, at.year, at.month, O.fraud.trueCases, O.fraud.caught, O.fraud.missed, O.fraud.falseAlerts]);
    await client.query("INSERT INTO bank.alert_month (game_id, year, month, kind, true_cases, caught, missed, false_alerts, unreviewed) VALUES ($1,$2,$3,'aml',NULL,NULL,$4,NULL,$5) ON CONFLICT DO NOTHING",
      [gid, at.year, at.month, O.missedA, O.unreviewed]);
  }
  for (const [key, p] of Object.entries((state.growth && state.growth.products) || {}))
    if (p.mRev != null)
      await client.query('INSERT INTO bank.product_month (game_id, year, month, product, revenue_pence, loss_pence, cost_pence) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING',
        [gid, at.year, at.month, key, pence(p.mRev), pence(p.mLoss), pence(p.mCost)]);
  if (facts.over) {
    const k = A.rating;
    await client.query(
      `INSERT INTO bank.year_result (game_id, year, status, letter, score, profit_pence, return_on_capital, peer_benchmark) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (game_id, year) DO UPDATE SET status = EXCLUDED.status, letter = EXCLUDED.letter, score = EXCLUDED.score, profit_pence = EXCLUDED.profit_pence, return_on_capital = EXCLUDED.return_on_capital, peer_benchmark = EXCLUDED.peer_benchmark`,
      [gid, at.year, facts.over, k.letter, k.score, pence(k.profit), k.roe, k.peer]);
  }
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
      `INSERT INTO bank.decision (game_id, command_seq, card_id, kind, year, month, options, chosen, truth, shown)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [gid, seq, card.id, card.kind, before.year, before.month,
        JSON.stringify(card.opts.map((o) => ({ k: o.k, l: o.l }))), cmd.k, JSON.stringify(card.h || {}), JSON.stringify((card.fields || []).map((f) => ({ l: f.l, v: f.v })))]);
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
  await syncFunding(client, gid, facts.instruments || []);
  await syncAnalytics(client, gid, before || { year: state.year, month: state.month }, state, facts, cmd.type === 'closeMonth');
  if (state.growth && (cmd.type === 'closeMonth' || cmd.type === 'nextYear')) await syncGrowth(client, gid, before || { year: state.year, month: state.month }, state, cmd.type === 'closeMonth');
  if (state.ops && (cmd.type === 'closeMonth' || cmd.type === 'nextYear')) await syncOperations(client, gid, before || { year: state.year, month: state.month }, state, cmd.type === 'closeMonth');
  if (cmd.type === 'closeMonth' && state.px && state.px.hist.length) {
    const h = state.px.hist[state.px.hist.length - 1];
    await client.query('INSERT INTO bank.share_price (game_id, year, month, price, book_per_share, multiple) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING', [gid, h.y, h.m, h.price, h.book, h.mult]);
  }
  if ((state.swaps && state.swaps.length) || cmd.type === 'closeMonth' || cmd.type === 'nextYear') await syncHedges(client, gid, before, state);
  if (cmd.type === 'closeMonth') {
    const notional = (state.swaps || []).reduce((a, w) => a + w.n, 0);
    if (notional > 0 || state.collateral > 0)
      await client.query('INSERT INTO bank.hedge_position (game_id, year, month, notional_pence, mtm_pence, collateral_pence) VALUES ($1,$2,$3,$4,$5,$6)', [gid, before.year, before.month, pence(notional), pence(facts.mtm || 0), pence(state.collateral || 0)]);
    for (const r of (facts.ladder && facts.ladder.rows) || [])
      await client.query('INSERT INTO bank.liquidity_ladder (game_id, year, month, bucket, inflow_pence, outflow_pence, cover_pence) VALUES ($1,$2,$3,$4,$5,$6,$7)', [gid, before.year, before.month, r.key, pence(r.inflow), pence(r.outflow), pence(r.cover)]);
  }
  if (cmd.type === 'closeMonth') {
    for (const c of facts.cohorts)
      await client.query(
        `INSERT INTO bank.portfolio_cohort (game_id, year, month, product, risk_band, issued, loans, balance_pence, rate_pct, pd, lgd,
           expected_loss_pence, rwa_pence, current_pence, days_30_pence, days_60_pence, plan_pence)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [gid, before.year, before.month, c.product, c.band, c.issued, c.n, pence(c.bal), c.rate, c.pd, c.lgd, pence(c.expectedLoss), pence(c.rwa),
          pence(c.buckets.current), pence(c.buckets.d30), pence(c.buckets.d60), pence(c.buckets.plan)]);
  }

  const status = facts.over === 'done' || facts.over === 'resigned' ? 'finished' : facts.over ? 'failed' : 'active';
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
    const body = req.body || {};
    const opts = {};
    if (body.tutorial) opts.tutorial = true;
    if (body.scenario) opts.scenario = String(body.scenario);
    if (body.households && !opts.tutorial && !opts.scenario) opts.households = true;
    if (body.meetings && !opts.tutorial && !opts.scenario) opts.meetings = true;
    if (body.chiefExecutive && !opts.tutorial && !opts.scenario) opts.chiefExecutive = true;
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

  // There is deliberately no route that deletes a game: games are never removed, by anyone.
}

module.exports = { register, toPence, validate, cleanCommand };
