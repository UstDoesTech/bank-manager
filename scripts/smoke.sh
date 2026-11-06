#!/usr/bin/env bash
# Plays through a deployed server: register, confirm (the link is read from the outbox with the Lakebase administrator
# role, since there is no email service yet), sign in, accept the notice, start a game, then delete the test player.
#   scripts/smoke.sh https://<app url>        needs scripts/pg.sh to work (DATABRICKS_* in the environment)
set -euo pipefail
URL=${1:?app url}; EMAIL="smoke-$(date +%s)@example.com"; PW="smoke test password $RANDOM$RANDOM"; JAR=$(mktemp)
j() { curl -fsS -b "$JAR" -c "$JAR" -H 'content-type: application/json' "$@"; }
curl -fsS "$URL/healthz"; echo
j -X POST "$URL/api/register" -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\"}" >/dev/null
token=$(bash scripts/pg.sh -At -c "SELECT body FROM account.outbox WHERE recipient = '$EMAIL' ORDER BY id DESC LIMIT 1" | grep -o 'token=[A-Za-z0-9_-]*' | head -1 | cut -d= -f2)
[ -n "$token" ] || { echo "no confirmation mail for $EMAIL"; exit 1; }
curl -fsS -o /dev/null "$URL/api/confirm?token=$token"
j -X POST "$URL/api/login" -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\"}" >/dev/null
j -X POST "$URL/api/consent" -d '{}' >/dev/null
g=$(j -X POST "$URL/api/games" -d '{"households":true}')
echo "game: $(printf '%s' "$g" | head -c 200)"
j -X DELETE "$URL/api/me" -d "{\"password\":\"$PW\"}"; echo
n=$(bash scripts/pg.sh -At -c "SELECT count(*) FROM account.player WHERE lower(email) = '$EMAIL'")
[ "$n" = 0 ] || { echo "test player was not removed"; exit 1; }
echo "smoke test passed"
