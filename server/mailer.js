'use strict';
// Sends the verification and reset emails.
//
// With RESEND_API_KEY set (and MAIL_FROM, an address on a domain verified with Resend) mail goes out through Resend's HTTPS API.
// Without it the "mailer" writes to account.outbox and logs the message, so the whole sign-up flow can be tried locally with no
// email service.
//
// Addresses ending in @smoke.invalid never leave the server: they are written to the outbox even when Resend is on, so the deploy's
// smoke test can read its own confirmation link. A real player's link is never stored in the outbox once Resend is on.
// A failed send is logged (with the address's domain only) and does not fail the request, because sign-up must not reveal whether
// an address is registered, and the player can use "Forgot password" to get another link.
const SMOKE = /@smoke\.invalid$/i;

function createDevMailer(pool, log) {
  return {
    async send({ to, subject, body }) {
      await pool.query('INSERT INTO account.outbox (recipient, subject, body) VALUES ($1, $2, $3)', [to, subject, body]);
      if (log) log.info({ to, subject }, 'dev mail written to account.outbox\n' + body);
    },
  };
}

function createResendMailer({ apiKey, from, pool, log, fetchImpl = fetch, endpoint = 'https://api.resend.com/emails' }) {
  const dev = createDevMailer(pool, null);
  return {
    async send({ to, subject, body }) {
      if (SMOKE.test(to)) return dev.send({ to, subject, body });
      try {
        const res = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({ from, to: [to], subject, text: body }),
        });
        if (!res.ok) throw new Error(`Resend answered ${res.status}`);
      } catch (e) {
        if (log) log.error({ domain: String(to).split('@')[1], subject, err: e.message }, 'the email could not be sent');
      }
    },
  };
}

// Picks the mailer from the environment.
function createMailer({ pool, log, env = process.env, fetchImpl }) {
  if (env.RESEND_API_KEY) {
    if (!env.MAIL_FROM) throw new Error('RESEND_API_KEY is set but MAIL_FROM is not: set it to an address on a domain verified with Resend');
    return createResendMailer({ apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM, pool, log, fetchImpl });
  }
  return createDevMailer(pool, log);
}

module.exports = { createDevMailer, createResendMailer, createMailer };
