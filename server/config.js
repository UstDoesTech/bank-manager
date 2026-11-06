'use strict';
const env = process.env;
module.exports = {
  databaseUrl: env.DATABASE_URL || 'postgres://bank:bank@localhost:5432/bank',
  port: +(env.PORT || 8080),
  baseUrl: env.BASE_URL || 'http://localhost:8080',      // used in emailed links; https turns on Secure cookies
  sessionDays: +(env.SESSION_DAYS || 14),
  maxFailedLogins: +(env.MAX_FAILED_LOGINS || 5),         // per email, per window
  failedLoginWindowMinutes: +(env.FAILED_LOGIN_WINDOW_MINUTES || 15),
  confirmHours: 48,
  resetHours: 1,
};
