'use strict';
// The five-question literacy check. The questions and the answers live here, so the page cannot be used to read the
// answer key; the page fetches the questions and the server scores what it sends back.
const { HttpError } = require('./auth');

const OPTIONS_TF = [{ k: 'a', t: 'True' }, { k: 'b', t: 'False' }, { k: 'dk', t: 'Not sure' }];
const QUESTIONS = [
  { id: 'interest', concept: 'Interest and compounding', text: 'You put £100 in a savings account paying 2% a year and leave it there. After 5 years, how much will you have?',
    options: [{ k: 'a', t: 'More than £110' }, { k: 'b', t: 'Exactly £110' }, { k: 'c', t: 'Less than £110' }, { k: 'dk', t: 'Not sure' }], answer: 'a',
    why: 'Interest earns interest. £100 at 2% for 5 years grows to about £110.41, a little more than £110.' },
  { id: 'inflation', concept: 'Inflation', text: 'Your savings pay 1% a year and prices rise 2% a year. After a year, what can you buy with the money in the account?',
    options: [{ k: 'a', t: 'More than today' }, { k: 'b', t: 'The same as today' }, { k: 'c', t: 'Less than today' }, { k: 'dk', t: 'Not sure' }], answer: 'c',
    why: 'The real return is the interest rate minus inflation. Here it is about minus 1%, so the money buys less.' },
  { id: 'diversification', concept: 'Diversification and risk', text: 'Buying shares in a single company usually gives a safer return than a fund that holds shares in many companies.',
    options: OPTIONS_TF, answer: 'b',
    why: 'A fund spreads the risk, so one company doing badly cannot sink it. A single company can lose almost everything.' },
  { id: 'mortgage', concept: 'Mortgage cost over the term', text: 'A 15-year mortgage usually has higher monthly payments than a 30-year mortgage, but you pay less interest in total.',
    options: OPTIONS_TF, answer: 'a',
    why: 'Paying off faster means higher payments, but interest is charged on the balance for fewer years, so the total is much lower.' },
  { id: 'bonds', concept: 'Bond prices and interest rates', text: 'If interest rates rise, what will typically happen to the price of bonds that already exist?',
    options: [{ k: 'a', t: 'They rise' }, { k: 'b', t: 'They fall' }, { k: 'c', t: 'They stay the same' }, { k: 'd', t: 'There is no link' }, { k: 'dk', t: 'Not sure' }], answer: 'b',
    why: 'New bonds pay more, so existing ones that pay less are worth less. This is what happened to the bank in the rate shock.' },
];
const KEY = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));

// Validates and scores a set of answers. Every question must be answered, with one of its own options.
function scoreAnswers(answers) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new HttpError(400, 'bad_answers', 'Send an answer for each question.');
  const clean = {}, correct = {};
  let score = 0;
  for (const q of QUESTIONS) {
    const a = answers[q.id];
    if (typeof a !== 'string' || !q.options.some((o) => o.k === a)) throw new HttpError(400, 'bad_answers', `Answer ${q.id} with one of its options.`);
    clean[q.id] = a; correct[q.id] = a === q.answer; if (correct[q.id]) score++;
  }
  return { answers: clean, correct, score };
}

function register(app, { pool }) {
  const auth = { preHandler: app.requireAuth };
  const yearsPlayed = async (key) => (await pool.query(
    `SELECT count(*)::int AS n FROM bank.regulatory_snapshot r JOIN bank.game g ON g.id = r.game_id
     WHERE g.player_key = $1 AND NOT g.tutorial AND r.month = 11`, [key])).rows[0].n;
  const attempts = async (key) => (await pool.query('SELECT count(*)::int AS n FROM bank.literacy_check WHERE player_key = $1', [key])).rows[0].n;

  // What the page shows: the questions without answers, and whether a check is due. One check is offered before the
  // first game and one more for each completed year of play.
  app.get('/api/literacy', auth, async (req) => {
    const key = req.player.player_key, [years, done] = [await yearsPlayed(key), await attempts(key)];
    return { due: done < 1 + years, phase: done === 0 ? 'before' : 'after', attempt: done + 1, yearsPlayed: years,
      questions: QUESTIONS.map(({ id, concept, text, options }) => ({ id, concept, text, options })) };
  });

  app.post('/api/literacy', auth, async (req, reply) => {
    const p = req.player;
    const body = req.body || {}, { answers, correct, score } = scoreAnswers(body.answers);
    const key = p.player_key, years = await yearsPlayed(key), done = await attempts(key);
    if (done >= 1 + years) throw new HttpError(409, 'not_due', 'There is no check due yet. One more is offered after each year you play.');
    let gameId = null;
    if (body.gameId) {
      const g = (await pool.query('SELECT id FROM bank.game WHERE id = $1 AND player_key = $2', [String(body.gameId), key])).rows[0];
      if (!g) throw new HttpError(404, 'no_such_game', 'No such game.');
      gameId = g.id;
    }
    const phase = done === 0 ? 'before' : 'after';
    try {
      await pool.query(
        `INSERT INTO bank.literacy_check (player_key, attempt, phase, years_played, game_id, answers, correct, score, in_analysis)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [key, done + 1, phase, phase === 'before' ? 0 : years, gameId, JSON.stringify(answers), JSON.stringify(correct), score, !p.analysis_opt_out]);
    } catch (e) {
      if (e.code === '23505') throw new HttpError(409, 'not_due', 'That check was already saved.');     // two submissions at once
      throw e;
    }
    reply.code(201);
    return { score, attempt: done + 1, phase, results: QUESTIONS.map((q) => ({ id: q.id, concept: q.concept, correct: correct[q.id], why: q.why })) };
  });
}

module.exports = { register, QUESTIONS, scoreAnswers };
