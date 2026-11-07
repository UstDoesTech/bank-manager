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

Open http://localhost:8080. A game started without signing in is still recorded, anonymously: the server makes a guest
player (a random key, no name or email, a one-year cookie), the title screen says so, and "Don't record my games" turns it
off on that device (the game then plays offline as before). Opening the page records nothing; the guest is created when a
game starts. A guest can sign in or create an account to keep their games (registering claims the same player row). A guest
cannot delete their games (the server refuses it); only an account can. Guests do not get the literacy check, which is for signed-in players.
To sign in to an account, choose "Sign in to save your games", create one, and confirm the address. There is no email
service locally: the confirmation link is written to a table and to the server log.

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
- Every game starts with a **system pricing and credit policy** (`S.policy`, `systemPolicy()` in the engine) that reproduces how the branch game has always priced loans and judged applications. `setPolicy` is refused until the area is unlocked (`progress.unlocked` has `pricing` or `credit`), so until a player gets Chief Executive control they play on the system values. `policyVerdict()` applies the credit policy to an application (approve, refer or decline) using only what the applicant shows. A strong year (rating A or better) hands over the next area, pricing first and then credit, with a letter from the board. The page shows a Policy button once an area is yours. Prices above the system's lose customers and attract riskier ones (mortgages are the most sensitive); `node tools/policy-sweep.js` (`SEEDS=150 YEARS=3` for a stable answer, about 2.5 minutes) checks that no price beats the system price for free. In the last run the system mortgage spread was the best of six. The personal loan and card prices barely moved the result, because the careful bot rarely uses those levers. Taking over credit policy hands the lending desk to the policy (`deskByPolicy()`): mortgage and personal applications are approved or declined by `policyVerdict()`, the bank sees more applications than a branch counter, and only borderline cases reach the player. `node tools/policy-sweep.js --credit` compares cut-offs; in the last run (40 seeds, 3 years) the executive team's cut-offs earned 634, tight 415, loose 274 and "anything goes" lost 757. Named loans are not yet drawn from cohorts, and the desk always offers standard prices. Treasury and capital unlock after the third and fourth strong years. Owning treasury replaces the treasury card with standing rules (`treasuryByPolicy()`: surplus cash above a target share of deposits goes into gilts, long or short as set, and a shortfall is covered by selling gilts at market value). Owning capital replaces the capital card (`capitalByPolicy()`: below the target ratio, raise shares, sell half the new mortgages, or carry on). `node tools/policy-sweep.js --treasury --capital` compares settings. Capital shows a clear optimum: carrying on has the worst tail, raising to a moderate target scores best, and over-capitalising lowers the rating through return on equity. Treasury does not yet bite: gilts are carried at book value in capital, so a long-gilt loss only appears when gilts are sold, so that was true until the next change: a player who owns treasury now carries gilts at market value (`giltCarry()`, `syncGilts()` posts a `gilts.revalue` entry each month and when ownership changes, and handing treasury back returns to cost). Long gilts now win when rates fall and lose heavily when they rise, so the cash target and long share are a real risk-and-return choice. **Quiet months:** taking over an area starts three months with no scheduled liquidity shock, outage or market crash; shocks due in that window move to the month after it (`startQuiet()`, `applyQuiet()`). They start on taking over, not on unlocking, so a player is not penalised for waiting. **Funding** unlocks after treasury and replaces the Bank Rate card with two rules (`fundingByPolicy()`): the savings rate is the market rate plus a gap, and the bank tops up three-month wholesale borrowing to a share of deposits at Bank Rate plus a spread that widens with stress. In a freeze (a liquidity shock month and the two after, or a crash and the month after) nothing is renewed, and a mail warns of the wholesale share and what falls due. Wholesale is a new liability (`wholesale`, `S.wholesale`, `S.wsTranches`) and loans run off at maturity even after funding is handed back. **Dividends** are part of capital policy: a share of each month's profit is paid out (`equity.dividend`), adding up to 8 rating points at a 5% yield, and the regulator objects if capital is below the minimum. Capital is now the last area to unlock. In the sweeps (`--funding`, `--funding-desk`, `--dividends`), a savings gap near zero gave the best rating when the lending desk was running, heavy wholesale (35%) clearly hurt the worst outcomes, and a moderate dividend scored best. **Bonds, large depositors, pool sales.** Funding policy also issues fixed-term bonds (1 to 3 years, fixed rate, repaid or refinanced at maturity, with a maturity-wall warning), accepts offers from large depositors up to a cap (they leave in one decision, far more often in a freeze or when the bank looks weak), and can sell a pool of current mortgages when liquidity is short or as a capital action (action 3). A pool sale keeps 5% as a first-loss slice (`retained`, risk weight 200%) and the buyer pays a discount that widens with market stress and the pool's risk; the bank's loss on a pool never exceeds the slice and the rest falls on investors. New accounts are `bonds` and `retained` (migration 004). In the sweeps (`--bonds`, `--large`, `--pools`): bonds cost money with little visible benefit except in the worst tenth; a small cap on large depositors (15%) was best and bigger caps lost the benefit; a 25% pool of the best loans was nearly as good as raising shares, while selling the worst loans or large pools hurt.

**Financial literacy.** (1) The year-end screen says that default rates are about three times real-world levels and time is compressed. (2) `makeDebrief()` writes three to five notes at each year end, each tagged with its PISA area and the Lusardi and Mitchell question, ranked so that ideas not yet seen come first; the player reads them from the year-end screen or skips them. (3) Games started from the page's New game button have seven recurring households (`S.households`, only when `opts.households` is set, so tutorials, scenarios and the golden games are unchanged): their money moves each month with unemployment and life events, with the loans the player gives them, and with missed payments and overdraft fees; about a third of mortgage, personal and card applications come from them, with a note on what happened last time; a Customers panel shows each household's budget bar, emergency fund and credit score line, and a name on a document opens it. The cast and each closed month are stored in `bank.household` and `bank.household_month` (migration 005). (4) A five-question check (interest, inflation, diversification, mortgage cost, bond prices) is offered before the first recorded game and again after each year played, from the year-end screen. `server/literacy.js` holds the questions and the answer key, so the page never sees it. Results go in `bank.literacy_check` keyed by the opaque player key (migration 006) and are removed when the player is deleted. Views `literacy_progress`, `literacy_by_concept` and `literacy_with_play` exclude players who keep their games out of analysis, and `db/analysis/literacy.sql` has the example queries (a test runs each one).
- Reading a message is not sent: it changes no money. The server accepts a `read` command, but the page skips it.

## Deploying to Azure (Container Apps and Lakebase)

Same pattern as the p-doom human app. Nothing here has been run against Azure or Databricks yet; CI checks the Bicep
syntax and builds the image.

| Thing | Value |
| --- | --- |
| Registry, Container Apps environment, resource group | the playground's existing `builtonplayground`, `managedEnvironment-rgpersonalnustu-b3e2`, `rg-personal-n-ust-ust-built-on-playground`. Nothing new is created but a managed identity, its AcrPull role and the app (`infra/main.bicep`). |
| Database | Databricks Lakebase, project `bank-manager`, database `bank`, created by the `lakebase` workflow. |
| App sign-in to Postgres | a dedicated service principal. The server asks Databricks for a one-hour database credential and renews it after 45 minutes (`server/lakebase.js`; set `LAKEBASE_ENDPOINT`, `PGHOST`, `PGDATABASE` and the `DATABRICKS_*` login). |
| Schema changes | applied by the deploy as the admin service principal (`node server/migrate.js`). The app runs with `MIGRATE=off` and its role can read and write the `account` and `bank` schemas but cannot change them. |

First-time order: run the `lakebase` workflow, then `deploy` with `deploy=true`. The deploy applies the migrations, creates the
app's Postgres role, builds the image in the registry, rolls out the Bicep and runs `scripts/smoke.sh` against the live URL
(register, confirm, sign in, start a game, delete the test player). Secrets: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`,
`AZURE_SUBSCRIPTION_ID`, `DATABRICKS_HOST`, `DATABRICKS_CLIENT_ID`, `DATABRICKS_CLIENT_SECRET` (admin), and
`BANK_DATABRICKS_CLIENT_ID`, `BANK_DATABRICKS_CLIENT_SECRET` (the app's own service principal, which must be allowed to
request Lakebase credentials for the project; the workflow does not grant that). `ci` runs all the tests on every push.

Not done: there is no email service, so on Azure the confirmation link is still only in `account.outbox` (the smoke test reads
it from there). Replace `server/mailer.js` with Azure Communication Services before real players sign up.

## Executive team, early warnings and the stress test

Once a player has been handed any Chief Executive area, the Policy tab opens three screens (Team, Settings, Stress test); none
of this applies to branch-manager play. All of it is in `engine/engine.js` (`indicators()`, `advisers()`, `warnMonth()`,
`stressTest()`, `runStress()`) and uses no random numbers, so it cannot change how a game plays.

- **Early warnings** (`indicators()`): capital buffer, liquidity ratio, survival horizon (days a severe run could be paid out:
  5% of ordinary deposits, every large depositor and any wholesale falling due, against cash and gilts), wholesale share,
  maturity wall over six months, large depositor share, loans behind with payments, riskiest lending, and interest-rate
  sensitivity of a year's net interest income. Each is ok, watch or alarm. At the start of each month the treasurer or
  chief risk officer mails when one gets worse (at most two a month, once per move into a worse band).
- **Executive team** (`advisers()`): finance director, chief risk officer, treasurer and head of operations comment from
  the same numbers and your settings, and some of their advice conflicts (extra yield against the cash that carries you
  through a run). The rules are simple thresholds, not a model.
- **Stress test** (`stress` command): copies the bank, imposes a severe recession counted from the next month (unemployment
  up 4.5 points, house prices down 23%, losses 2.5 times the normal rate, a funding freeze and a market crash) for nine
  months, and lets your standing rules run it. Cards that need a decision take their first allowed option. Overrides let the
  Settings screen test values that have not been saved. The result is stored in `S.stress` and shown on every screen. It
  cannot run on the year-end screen, because there is no month to start from. The copy is isolated: it does not touch the real
  bank, the random stream or the ledger sink (a test checks all three).
- **Starting as Chief Executive:** `POST /api/games` with `chiefExecutive: true` (engine option `opts.chiefExecutive`) starts with
  every area handed over. The page has no button for it yet.

- **Board confidence** (`boardMonth()`, `boardMeeting()`, `resign()`): the board starts to watch once the player has taken over an
  area (being offered one and leaving it alone is safe, so branch play and the golden games are unchanged). Confidence runs
  0 to 100 from 60 and moves every month: up with return on capital ahead of the peer benchmark and a steadily paid
  dividend, down with a lagging return, capital or liquidity breaches, a regulator in enforcement, Bank of England
  borrowing, a big monthly loss, and risk indicators left in alarm, drifting back toward 55 when nothing happens. Every third
  month the board meets and mails where the player stands and why. Below 20 at two meetings in a row, or regulator
  enforcement action at a meeting, ends the job (`over: 'sacked'`, a Herald story, rating D). `resign` ends it voluntarily
  (`over: 'resigned'`), rated on the year so far. In 30 seeds over three years, careful rules were never sacked, greedy
  play was sacked twice, and reckless settings lost the job in 16 and failed the bank in 14. The Team screen shows the
  meter, the next meeting and the last six quarters, and has the resign button.

- **Hedging** (`hedgeByPolicy()`, `swapMonth()`, treasury policy `hedgeTarget` and `hedgeYears`): New mortgages are lent at a fixed rate
  while savers and wholesale lenders follow Bank Rate. A pay-fixed swap pays a fixed rate (Bank Rate plus 0.1 points and a little
  more for a longer term) and receives Bank Rate on a notional amount, so it pays out when rates rise and costs when they
  fall. The standing rule tops swaps up to the target share of the fixed mortgage book each month. Each month's net payment is
  a profit or loss (`pl.swaps`). A swap's value is not in capital, but when it is under water the shortfall is posted as cash
  collateral (`collateral`, an asset that does not count as liquid) and comes back as the value recovers or the swap ends.
  Swaps cannot be cancelled and run to their end even if treasury is handed back. A target above 100% is a bet on rising rates and
  is flagged as an over-hedge. Over three years of careful play, a 100% hedge improved capital in a rate shock by about
  £186k and cost about £106k more in a recession, and 150% cost more again (20 seeds), so it is insurance, not free money.
- **Maturity ladder** (`maturityLadder()`): contractual loan repayments against wholesale and bond funding falling due, in five
  buckets (within a month, 1 to 3, 3 to 6, 6 to 12 months, over a year), with a stressed run on deposits shown separately (5% of
  ordinary deposits and every large depositor in a month). It gives a liquidity coverage figure and a "left after a run" amount
  per bucket, and three more early warnings: funding gap by maturity, swap cover, and collateral posted.
- **Second stress scenario:** the stress test now has a rate shock (Bank Rate to 6.5%, inflation 8%, house prices down 12%) beside the
  severe recession, so a hedge's value shows in one and its cost in the other. Migration 008 adds the `collateral` and
  `pl.swaps` accounts, `bank.hedge`, `bank.hedge_position` and `bank.liquidity_ladder`; the replay checks stored swaps.

Not built: the monthly executive meeting (settings still apply at once), share price, and indicators for staffing and alerts
(they need the operations phase).

## Things to know

- Game state is stored as `json`, not `jsonb`. Postgres `jsonb` reorders keys and the engine sums floating-point numbers in key order, so a reloaded game could differ by a rounding error from a replayed one.
- The page does not hide a case's hidden truth from the player, since it plays on its own engine. That is fine for a single-player game but would need changing before any competitive mode.
- Not built yet: the Azure email service (replace `server/mailer.js`), and the security-holding and hedge tables, which need the treasury work in a later step.
