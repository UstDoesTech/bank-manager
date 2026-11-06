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
- The loan book is recorded as party, agreement and collateral rows, and each month end as cohorts (product, risk band, month of issue) with balance, rate, probability of default, loss given default, expected loss, risk-weighted assets and arrears buckets. The cohorts are a view computed from the named loans (`portfolio()` in the engine), so they cannot change how a game plays. The replay checks the agreements against the replayed loans. There is no 90+ day bucket: the game writes an account off after two months.
- Every game starts with a **system pricing and credit policy** (`S.policy`, `systemPolicy()` in the engine) that reproduces how the branch game has always priced loans and judged applications. `setPolicy` is refused until the area is unlocked (`progress.unlocked` has `pricing` or `credit`), so until a player gets Chief Executive control they play on the system values. `policyVerdict()` applies the credit policy to an application (approve, refer or decline) using only what the applicant shows. A strong year (rating A or better) hands over the next area, pricing first and then credit, with a letter from the board. The page shows a Policy button once an area is yours. Prices above the system's lose customers and attract riskier ones (mortgages are the most sensitive); `node tools/policy-sweep.js` (`SEEDS=150 YEARS=3` for a stable answer, about 2.5 minutes) checks that no price beats the system price for free. In the last run the system mortgage spread was the best of six. The personal loan and card prices barely moved the result, because the careful bot rarely uses those levers. Taking over credit policy hands the lending desk to the policy (`deskByPolicy()`): mortgage and personal applications are approved or declined by `policyVerdict()`, the bank sees more applications than a branch counter, and only borderline cases reach the player. `node tools/policy-sweep.js --credit` compares cut-offs; in the last run (40 seeds, 3 years) the executive team's cut-offs earned 634, tight 415, loose 274 and "anything goes" lost 757. Named loans are not yet drawn from cohorts, and the desk always offers standard prices.
- Reading a message is not sent: it changes no money. The server accepts a `read` command, but the page skips it.

## Things to know

- Game state is stored as `json`, not `jsonb`. Postgres `jsonb` reorders keys and the engine sums floating-point numbers in key order, so a reloaded game could differ by a rounding error from a replayed one.
- The page does not hide a case's hidden truth from the player, since it plays on its own engine. That is fine for a single-player game but would need changing before any competitive mode.
- Not built yet: the Azure deployment, Lakebase (it will be a different `DATABASE_URL` and the same migrations), the Azure email service (replace `server/mailer.js`), and the security-holding and hedge tables, which need the treasury work in a later step.
