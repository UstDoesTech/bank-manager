# Bank Manager

A banking game. `Bank Manager.html` is the whole game in one file and still runs offline in a browser. The game
server records games to Postgres as a working banking system. The design is in
`Bank Manager Chief Executive mode and banking back end.md`.

## Layout

| Path | What it is |
| --- | --- |
| `engine/engine.js` | The game engine: no DOM, deterministic, double-entry ledger. The single source of truth. |
| `Bank Manager.html` | The playable page. `npm run build` copies the engine into it, so edit `engine/engine.js`, not the copy. |
| `server/` | Fastify game server: accounts, the command API, the replay checker. |
| `db/migrations/` | Postgres schema, applied automatically on server start. |
| `tools/`, `test/` | Headless bots and harness, golden snapshots, server and browser tests. |

## Run it locally

```
docker compose up --build          # Postgres + the game server
```

Open http://localhost:8080. Without signing in, the game plays offline exactly as before. To record games, choose
"Sign in to save your games", create an account, and confirm the address. There is no email service locally: the
confirmation link is written to a table and to the server log.

```
docker compose logs app                                                         # the confirmation link is in here
docker compose exec db psql -U bank -d bank -c "select body from account.outbox order by id desc limit 1"
docker compose exec app node server/replay.js                                   # rebuild every game from its commands and compare
docker compose down -v                                                          # stop and wipe the database
```

## Tests

```
npm test                  # engine: 497 checks, no database needed (golden games, replay, ledger)
docker compose up -d db   # the next two need Postgres
npm run test:server       # API, accounts, ledger, replay, rollback, privacy (throwaway database per run)
npm run test:browser      # the real page in Edge/Chrome against the real server, including going offline
npm run test:all
```

After changing `engine/engine.js`, run `npm run build` so the page picks it up. `npm test` fails if it is out of date.

## How a game is recorded

- The page asks the server for a game and plays on its own copy of the engine. The server chooses the seed.
- Each command (decide a case, close the month, buy an upgrade, next year) is sent in order with its sequence number.
  The server checks it, runs it on its own engine and, in one transaction, writes the command, the events, the decision
  with the case's hidden truth, the journal lines and the new state. A repeated or out-of-order command is refused.
- The journal is double entry, stored in whole pence. The database refuses to commit an entry that does not sum to zero.
- `server/replay.js` rebuilds a game from its seed and commands and checks the state, every journal line and the
  decisions against what was stored. It also catches any edit to the stored commands.
- If the connection drops, the page keeps unsent commands in `localStorage` and sends them when it can.
- Reading a message is not sent: it changes no money. The server accepts a `read` command, but the page skips it.

## Things to know

- Game state is stored as `json`, not `jsonb`. Postgres `jsonb` reorders keys and the engine sums floating-point
  numbers in key order, so a reloaded game could differ by a rounding error from a replayed one.
- The page does not hide a case's hidden truth from the player, since it plays on its own engine. That is fine for a
  single-player game but would need changing before any competitive mode.
- Not built yet: the Azure deployment, Lakebase (it will be a different `DATABASE_URL` and the same migrations),
  the Azure email service (replace `server/mailer.js`), and the party, agreement, collateral, security and hedge tables,
  which need the portfolio loan model from step 3.
