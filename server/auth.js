'use strict';
const crypto = require('crypto');
const argon2 = require('@node-rs/argon2');

const COOKIE = 'bm_session';
// Argon2id with the OWASP minimum cost (19 MiB, 2 passes, 1 lane). Algorithm 2 = Argon2id.
const ARGON = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 };
const hashPassword = (pw) => argon2.hash(pw, ARGON);
const verifyPassword = (hash, pw) => argon2.verify(hash, pw).catch(() => false);
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

class HttpError extends Error {
  constructor(status, code, message) { super(message || code); this.status = status; this.code = code; }
}

function register(app, { pool, mailer, config }) {
  const secure = config.baseUrl.startsWith('https');
  const guestDays = config.guestDays || 365;            // a guest has no password to get back in with, so the cookie lasts
  const setCookie = (reply, token, days = config.sessionDays) => reply.setCookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: days * 86400,
  });

  // Every request: resolve the session cookie to a player (or null).
  app.decorateRequest('player', null);
  app.addHook('preHandler', async (req) => {
    const raw = req.cookies && req.cookies[COOKIE];
    if (!raw) return;
    const { rows } = await pool.query(
      `SELECT p.id, p.player_key, p.email, p.consent_at, p.analysis_opt_out, p.guest
         FROM account.session s JOIN account.player p ON p.id = s.player_id
        WHERE s.token_hash = $1 AND s.expires_at > now()`, [sha(raw)]);
    req.player = rows[0] || null;
  });
  app.decorate('requireAuth', async (req) => { if (!req.player) throw new HttpError(401, 'not_signed_in', 'Sign in first.'); });

  async function issueToken(playerId, kind, hours) {
    const token = newToken();
    await pool.query('INSERT INTO account.token (token_hash, player_id, kind, expires_at) VALUES ($1, $2, $3, now() + make_interval(hours => $4))',
      [sha(token), playerId, kind, hours]);
    return token;
  }
  async function startSession(reply, playerId, days = config.sessionDays) {
    const token = newToken();
    await pool.query('INSERT INTO account.session (token_hash, player_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))',
      [sha(token), playerId, days]);
    setCookie(reply, token, days);
  }

  // Anonymous play. The page asks for this when a game is started without an account; the player is told first and can
  // decline (the page then plays offline). Limited per address so it cannot be used to fill the table.
  const guestHits = new Map();
  app.post('/api/guest', async (req, reply) => {
    if (req.player) return { ok: true, guest: req.player.guest };
    const now = Date.now(), hits = (guestHits.get(req.ip) || []).filter((t) => now - t < 3600e3);
    if (hits.length >= (config.guestsPerHour || 30)) throw new HttpError(429, 'too_many_guests', 'Too many new players from this address. Try again later.');
    hits.push(now); guestHits.set(req.ip, hits);
    if (guestHits.size > 5000) for (const [k, v] of guestHits) if (!v.some((t) => now - t < 3600e3)) guestHits.delete(k);
    // Recording cannot be switched off, so a guest is always recorded and always in analysis.
    const { rows } = await pool.query('INSERT INTO account.player (guest, consent_at, analysis_opt_out) VALUES (true, now(), false) RETURNING id');
    await startSession(reply, rows[0].id, guestDays);
    reply.code(201);
    return { ok: true, guest: true };
  });
  const creds = (body) => {
    const email = String((body && body.email) || '').trim();
    const password = String((body && body.password) || '');
    if (!EMAIL.test(email)) throw new HttpError(400, 'bad_email', 'That does not look like an email address.');
    return { email, password };
  };
  const checkPassword = (pw) => {
    if (pw.length < 10) throw new HttpError(400, 'weak_password', 'Use at least 10 characters.');
    if (pw.length > 200) throw new HttpError(400, 'weak_password', 'That password is too long.');
  };

  // Registering never reveals whether an address is already in use: the answer is always 202.
  app.post('/api/register', async (req, reply) => {
    const { email, password } = creds(req.body);
    checkPassword(password);
    const hash = await hashPassword(password);
    // A guest who registers keeps their games: the same row gains an email and password. If the address is taken the
    // answer is the same as for anyone else.
    let ins = { rows: [] };
    if (req.player && req.player.guest) {
      ins = await pool.query(
        `UPDATE account.player SET email = $2, password_hash = $3, guest = false
          WHERE id = $1 AND guest AND NOT EXISTS (SELECT 1 FROM account.player WHERE lower(email) = lower($2)) RETURNING id`,
        [req.player.id, email, hash]).catch((e) => { if (e.code === '23505') return { rows: [] }; throw e; });
    } else {
      ins = await pool.query(
        'INSERT INTO account.player (email, password_hash) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id', [email, hash]);
    }
    if (ins.rows[0]) {
      const token = await issueToken(ins.rows[0].id, 'confirm', config.confirmHours);
      await mailer.send({ to: email, subject: 'Confirm your Bank Manager account',
        body: `Welcome to Bank Manager. Confirm your email address:\n\n${config.baseUrl}/api/confirm?token=${token}\n\nThis link works for ${config.confirmHours} hours.` });
    } else {
      await mailer.send({ to: email, subject: 'Bank Manager sign-up',
        body: `Someone tried to register this address, which already has an account. If it was you, sign in or use "Forgot password".` });
    }
    reply.code(202);
    return { ok: true, message: 'Check your email to confirm the address.' };
  });

  app.get('/api/confirm', async (req, reply) => {
    const token = String((req.query && req.query.token) || '');
    const { rows } = await pool.query(
      `UPDATE account.token SET used_at = now()
        WHERE token_hash = $1 AND kind = 'confirm' AND used_at IS NULL AND expires_at > now() RETURNING player_id`, [sha(token)]);
    if (!rows[0]) return reply.code(400).type('text/html').send('<p>This link has expired or was already used.</p>');
    await pool.query('UPDATE account.player SET email_confirmed_at = COALESCE(email_confirmed_at, now()) WHERE id = $1', [rows[0].player_id]);
    return reply.redirect('/?confirmed=1');
  });

  app.post('/api/login', async (req, reply) => {
    const { email, password } = creds(req.body);
    const recent = await pool.query(
      `SELECT count(*)::int AS n FROM account.login_attempt
        WHERE lower(email) = lower($1) AND at > now() - make_interval(mins => $2)`, [email, config.failedLoginWindowMinutes]);
    if (recent.rows[0].n >= config.maxFailedLogins) throw new HttpError(429, 'too_many_attempts', 'Too many failed sign-ins. Try again later.');
    const { rows } = await pool.query('SELECT id, password_hash, email_confirmed_at FROM account.player WHERE lower(email) = lower($1)', [email]);
    const p = rows[0];
    // verify against a dummy hash when the address is unknown so the response time does not give it away
    const ok = p ? await verifyPassword(p.password_hash, password) : (await verifyPassword(DUMMY_HASH, password), false);
    if (!ok) {
      await pool.query('INSERT INTO account.login_attempt (email, ip) VALUES ($1, $2)', [email, req.ip]);
      throw new HttpError(401, 'bad_credentials', 'Email or password is wrong.');
    }
    if (!p.email_confirmed_at) throw new HttpError(403, 'email_not_confirmed', 'Confirm your email address first.');
    await pool.query('DELETE FROM account.login_attempt WHERE lower(email) = lower($1)', [email]);
    // The only notice is the cookie, and a session cookie is what records the games, so signing in is all the agreement there is.
    await pool.query('UPDATE account.player SET consent_at = COALESCE(consent_at, now()) WHERE id = $1', [p.id]);
    await startSession(reply, p.id);
    return { ok: true };
  });

  app.post('/api/logout', async (req, reply) => {
    const raw = req.cookies && req.cookies[COOKIE];
    if (raw) await pool.query('DELETE FROM account.session WHERE token_hash = $1', [sha(raw)]);
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/me', async (req) => {
    if (!req.player) return { signedIn: false };
    const p = req.player;
    return { signedIn: true, guest: !!p.guest, email: p.email, consented: !!p.consent_at, analysisOptOut: p.analysis_opt_out };
  });

  app.post('/api/forgot', async (req, reply) => {
    const email = String((req.body && req.body.email) || '').trim();
    if (EMAIL.test(email)) {
      const { rows } = await pool.query('SELECT id FROM account.player WHERE lower(email) = lower($1) AND email_confirmed_at IS NOT NULL', [email]);
      if (rows[0]) {
        const token = await issueToken(rows[0].id, 'reset', config.resetHours);
        await mailer.send({ to: email, subject: 'Reset your Bank Manager password',
          body: `Choose a new password:\n\n${config.baseUrl}/?reset=${token}\n\nThis link works for ${config.resetHours} hour and can be used once.` });
      }
    }
    reply.code(202);
    return { ok: true, message: 'If that address has an account, a reset link is on its way.' };
  });

  app.post('/api/reset', async (req) => {
    const token = String((req.body && req.body.token) || ''), password = String((req.body && req.body.password) || '');
    checkPassword(password);
    const { rows } = await pool.query(
      `UPDATE account.token SET used_at = now()
        WHERE token_hash = $1 AND kind = 'reset' AND used_at IS NULL AND expires_at > now() RETURNING player_id`, [sha(token)]);
    if (!rows[0]) throw new HttpError(400, 'bad_token', 'This link has expired or was already used.');
    await pool.query('UPDATE account.player SET password_hash = $2 WHERE id = $1', [rows[0].player_id, await hashPassword(password)]);
    await pool.query('DELETE FROM account.session WHERE player_id = $1', [rows[0].player_id]);   // sign out everywhere
    return { ok: true };
  });

  // The recording notice: the player must have seen it before the first recorded game.
  app.post('/api/consent', { preHandler: app.requireAuth }, async (req) => {
    // Accepting the notice is all there is: there is no opt-out, and a request that asks for one is ignored. (A flag set before this was
    // removed is left as it was.)
    await pool.query('UPDATE account.player SET consent_at = COALESCE(consent_at, now()) WHERE id = $1', [req.player.id]);
    return { ok: true, analysisOptOut: !!req.player.analysis_opt_out };
  });

  // Deleting a player removes the account and every game, command and ledger line.
  app.delete('/api/me', { preHandler: app.requireAuth }, async (req, reply) => {
    const password = String((req.body && req.body.password) || '');
    const { rows } = await pool.query('SELECT password_hash FROM account.player WHERE id = $1', [req.player.id]);
    if (req.player.guest) throw new HttpError(403, 'guest_cannot_delete', 'Guest games cannot be deleted. Create an account to manage your games.');
    if (!(await verifyPassword(rows[0].password_hash, password))) throw new HttpError(401, 'bad_credentials', 'Password is wrong.');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM bank.game WHERE player_key = $1', [req.player.player_key]);
      await client.query('DELETE FROM bank.literacy_check WHERE player_key = $1', [req.player.player_key]);
      await client.query('DELETE FROM account.player WHERE id = $1', [req.player.id]);
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });
}

let DUMMY_HASH = '';
hashPassword('not-a-real-password').then((h) => { DUMMY_HASH = h; });

module.exports = { register, HttpError, hashPassword, verifyPassword };
