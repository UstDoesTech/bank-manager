'use strict';
// Sends the verification and reset emails. Locally the "mailer" writes to account.outbox and logs the message, so
// the whole sign-up flow can be tried without an email service. In Azure this is replaced by Communication Services.
function createDevMailer(pool, log) {
  return {
    async send({ to, subject, body }) {
      await pool.query('INSERT INTO account.outbox (recipient, subject, body) VALUES ($1, $2, $3)', [to, subject, body]);
      if (log) log.info({ to, subject }, 'dev mail written to account.outbox\n' + body);
    },
  };
}
module.exports = { createDevMailer };
