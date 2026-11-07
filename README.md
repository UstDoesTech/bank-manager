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

**Email** goes out through [Resend](https://resend.com) when `RESEND_API_KEY` and `MAIL_FROM` are set (`server/mailer.js`): add the secret
`RESEND_API_KEY` and the repo variable `MAIL_FROM` (an address on a domain verified with Resend, for example `Bank Manager <noreply@yourdomain>`);
the deploy passes them to the app. Without them the app still runs, but confirmation links only land in `account.outbox`, which a real
player cannot use. With Resend on, a real player's link is never stored in the outbox; addresses at `smoke.invalid` stay on the server so the deploy's
smoke test can read its own link. A failed send is logged with the address's domain only and does not fail the request, because sign-up must not
reveal whether an address is registered; the player can use "Forgot password" for another link. Not yet tried against the real service.

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

- **Bank of England facility** (`boeFacility()`, funding policy `boeTarget`): the central bank lends against the loan book at Bank Rate
  plus 1% after a 30% haircut on the collateral. Owning funding, the player sets how much to keep drawn; the standing rule
  draws up to it (within the collateral) and repays down to it, and the old automatic repayment leaves that amount alone. Using
  it mails from the treasurer, puts a Herald story in the paper, adds an early warning, and costs board confidence for every month
  it is out. Forced emergency borrowing when cash runs out works as before.
- **Funding instruments** (`fundingInstruments()`, `bank.funding_instrument`): wholesale loans and bonds are now identified (id and start
  month, filled in for older saves) and listed with amount, rate and due date on the Team screen; the Bank of England is one running
  facility with no due date. The table keeps one row per instrument, marks repaid ones, and the replay checks the count.
- **Share price** (`shareMonth()`, `bank.share_price`): book value per share times a multiple that starts at 1 and moves slowly: up when
  return on equity beats the 10% cost of equity (damped over the first six months), down with volatile profits, enforcement and
  a capital breach. Shares start at 1,000k. A share issue (the capital card or the standing rule) is priced 10% under the market, creates
  new shares and so dilutes existing holders. The Team screen shows the price, book value, multiple, dividends per share and share
  issues, and the finance director comments (below book value, above book value, and the dilution a raise would cause).
  Tracked only once a Chief Executive area has been handed over.

Migration 009 adds `bank.funding_instrument` and `bank.share_price`.

## Operations (phase 2)

A sixth area, handed over after the other five (`operations` in the unlock order and Policy screen). Until the player takes it over the
executive team runs it well and none of this happens; once taken over, changes to staffing, overtime and projects take effect the
following month. All in `engine/engine.js` (`opsByPolicy()`, `opsMonth()`), using the game's random stream only when the player
owns the area, so branch play and the golden games are unchanged.

- **Teams:** counter, credit referrals, fraud operations, financial crime, complaints and IT change. Each person handles a number of
  cases a month (IT: points of change load). Demand comes from the size of the bank (with scale economies), the economy,
  how many alerts the thresholds raise, arrears and incidents. Work beyond capacity becomes a backlog.
- **What a backlog costs:** counter and credit queues cost customer trust; unprocessed fraud alerts are missed fraud that is refunded;
  unreviewed money-laundering alerts come back as regulator fines three months later; complaints older than eight weeks are upheld
  with redress. Losses are measured against what the executive team's plan misses, so the defaults cost nothing.
- **People:** hiring takes two months to arrive and a third to train, with a one-off cost; letting people go is at once and costs more;
  overtime adds 20% for up to three months, then people burn out; sustained load above 100% makes people leave, and the standing rule
  rehires toward the target. The Team screen shows staff, hires on the way, and the headcount that would run each team at about 80%.
- **Alert thresholds:** one for fraud, one for money laundering. Detection is `1 - (1 - s)^1.5`; false alarms grow with `s` squared, so
  a very sensitive threshold swamps analysts (and blocks genuine customers), and a lax one misses crime.
- **Change programme:** five projects (core banking migration, phased or big-bang; payments; regulatory reporting; mobile app; data
  platform), each with a cost, a duration, an IT load and a benefit. The change meter is running load over IT capacity; above
  100% projects slip and each month risks an outage, a data error or a missed report. A big-bang cutover can fail badly. Stopped
  projects lose the money spent.
- **Suppliers:** card processing, contact centre and IT hosting can be outsourced for lower costs. A supplier can fail, and the regulator
  still holds the bank responsible; oversight spending reduces both the chance and the harm (about £2.5k a month each is the
  sweet spot).
- **Early warnings and advice:** utilisation, oldest case, alerts per analyst, false-alarm rate, alerts closed without review, the change
  meter and supplier incidents, plus Head of operations, finance director and chief risk officer notes.
- **Balance** (two years of careful play, 16 seeds): the plan scores best; a 70% staffing level is slightly worse, 50% much worse (backlogs
  of months, trust and regulator standing falling, some failures); 40% extra staff costs more than it earns; all five projects at once
  fail most banks, and doubling IT staff mostly fixes it; outsourcing without oversight is about break-even on profit with many
  more incidents, and oversight at £8k a supplier costs more than it saves.
- **Data:** migration 010 adds `bank.team_month`, `bank.change_project`, `bank.incident` and `bank.supplier`; the replay checks incidents.

## The monthly executive meeting

In a game started with the meeting option (the page's New game turns it on; tutorials, scenarios and plain engine games do not have it)
settings are not changed on the spot. The player reads the dashboard and the advisers' notes on the Team screen, then tables changes
in Settings. Changes are queued (`S.pq`) and take effect when the month turns, or when the next year begins if it is the year end
(`applyQueuedPolicy()`). A bad value or a locked area is refused when it is tabled, setting a value back to what it already is withdraws the
change, and a handing-back is queued too. The form shows what the settings will become, the queue is listed with a button to
withdraw it, and quiet months and the board's watch start when a takeover takes effect, not when it is tabled. At the start of each
month the executive team mails an "Executive meeting" note (`meetingMail()`): the year's profit, capital and liquidity, what was
decided last month and is now in force, the indicators in trouble, and a line from each of the four advisers. The stress test's
copy still changes settings at once. The server accepts `meetings: true` when a game is created, and the replay is unchanged
because the queue is part of the state.

## Growth (phase 3)

A seventh area, handed over after operations (`growth`). Until the player takes it over none of this happens; once taken over the
random stream is used only for its events, so branch play and the golden games are unchanged. All in `engine/engine.js`
(`growthByPolicy()`, `growthMonth()`, `acquisitionOffer()`). Products and the branch network are modelled as contributions to
profit and to deposits, not as loans and accounts; acquisitions are on the balance sheet, through the ledger.

- **Products** (seven: buy-to-let, business overdrafts and asset finance, ISAs, credit builder card, buy now pay later, packaged accounts,
  green home loans): a launch costs to build, volume grows over a year then settles, and each has its own risk (rates and
  unemployment, sector downturns, the April ISA flight, high early losses, thin margins and big downturn losses, mis-selling, installer
  fraud). One marketing budget is shared across the live products (about £3k each brings in the full volume). Withdrawing a product stops new
  business and its income runs off over a year. The fee level (low, standard, high) earns more and raises the chance of failing the
  regulator's quarterly fair value review, which forces refunds and cuts the price.
- **Incentives and conduct:** the share of bonus tied to sales and to quality, the sales target, a quality gate, retraining spend and a
  one-off clawback. Volume-heavy schemes lift sales within a quarter; sales under pressure may be mis-sold, and the complaints
  are stored up to arrive 12 to 36 months later with redress. Eight upheld complaints in a year bring an independent review at the bank's
  cost (not again within two years). A hidden culture score falls under pressure and recovers with remedies; below 45 whistleblowers
  write to the inbox, and ignoring them makes mis-selling worse. The plan's normal mis-selling is already in the bank's results.
- **Acquisitions:** an offer arrives in the inbox every eight months or so (a car finance lender, a building society's mortgage book, a
  fintech). Light, standard or deep diligence costs £10k, £35k or £90k and tells you progressively more about the hidden loss
  rate, systems and undisclosed commission; then buy or walk away. Paying above book creates goodwill (`goodwill` on the
  ledger), which is deducted from capital in full but is a deal, not a result, so it does not count as a loss. The regulator will not
  allow a bid that would take capital below the minimum. After the purchase 8% of the book leaves, hidden losses arrive over 24
  months, redress surfaces at month six, integration takes a year (and uses change capacity if you run operations; it can slip),
  savings arrive from month 12 if it did not, and an underperforming deal has half its goodwill written down at month 24.
- **Branch network:** seven towns with a population, an age profile and a reliance on cash, set to none, hub or branch. Closing saves running
  costs and loses deposits, local business and trust, most in older cash-reliant towns; closing the last bank in a town makes the Herald and
  costs regulator standing. New towns build deposits and local business over a year.
- **Early warnings:** products still launching, the weakest product's margin, upheld complaints per 1,000 sales, unanswered whistleblower
  reports, goodwill as a share of capital, diligence coverage, integration progress and vulnerable customers hit by closures, plus advisers'
  notes.
- **Balance** (20 seeds, two years of careful play; profit against the plan's 242 in a random economy, 15 in a downturn, 216 in a soft landing and
  345 with sticky inflation): buy-to-let 181, -5, 252, 353; business overdrafts 227, -16, 224, 352; ISAs 178, 11, 178, 305; credit builder 124,
  -144, 149, 223; buy now pay later 55, -207, 184, 207; packaged accounts 184, -32, 206, 248; green loans 118, 31, 155, 263; all seven at
  once fail most banks. No product beats the plan in every economy. Volume-heavy bonuses earn 95, -165 and 95 in a random, downturn and soft
  economy, and a quality gate makes up about half the loss. Closing towns 1 to 3 earns 49, hubs 118, closing the two older towns 159, opening two new
  towns 115 and hubs in them 229 (76 against 15 in a downturn).
- **Data:** migration 011 adds `goodwill` and `equity.writedown` accounts and `bank.product`, `bank.product_review`, `bank.acquisition` (with
  the hidden loss rate the engine knew), `bank.incentive_month` and `bank.branch_site`; the replay checks products and acquisitions.

Every control area in the design is now built.

## The analysis layer

Migration 012 completes the data model and defines the metrics once, as SQL views, in `db/semantic/bank_metrics.yaml` (24 metrics, each
with its view, column, grain and unit; the layout follows the Open Semantic Interchange idea and can be converted to an Apache Ossie model).

- **Tables added:** `market_state` (Bank Rate, unemployment, house prices, share index, inflation, the economy), `policy_setting` (every rule
  change and when it took effect), `account` (the retail pool, each large depositor, each bond, each household's savings), `party_role`
  (borrower and guarantor), `security_holding` (month-end gilts), `risk_month` (rate sensitivity, survival horizon, LCR, wholesale and top-10
  depositor shares, loan to deposit, hedge ratio, collateral, change meter), `year_result` (return on capital and the peer benchmark),
  `alert_month`, `product_month`; `bank.decision` now keeps the papers shown on the desk. `bank."case"` and `bank.document` are views over
  decisions. Every `bank` table carries its FIBO or UOP term in a comment, and a test fails if one does not.
- **Metric views:** `metric_month` (net interest margin, cost/income, cost of risk, capital and liquidity ratios, loan to deposit, arrears
  rates, goodwill share, rate sensitivity, survival horizon, funding concentration, change load), `metric_year` (return on capital against
  peers), `metric_decision_accuracy` (by decision maker and case type: fraud, laundering, sanctions, onboarding, personal and business loans),
  `metric_fraud_month` and `metric_alerts_month` (detection and false alarms), `metric_team_month` (utilisation and oldest case age),
  `metric_product_month` and `metric_conduct_month` (complaints per 1,000 sales). They are built from the ledger (`v_month_pl`, `v_position`)
  and the stored facts, and a test checks them against the game's own figures (net interest, loan to deposit, capital ratio, the parts adding up to profit).
  There is no 90+ day arrears bucket because the game writes an account off after two months.
- **Privacy:** every view reads only games that allow analysis, are synthetic and are not the training day (`v_game`); a test confirms an opted-out
  player appears in none of them. The `bank_analysis` role can read the metric views, `bank."case"`, `bank.document` and the literacy views, and
  is refused everything underneath. Migration 012 creates it if it may; on Lakebase the deploy can create a login for a service principal
  (secret `ANALYSIS_DATABRICKS_CLIENT_ID`, optional) with `scripts/analysis-role.sql`.
- **Example queries:** `db/analysis/metrics.sql` (nine, including which settings were changed before a bank failed, whether hedging protected the
  margin, and which products pay in which economy); a test runs each, and the metric-only ones as the read-only role.

Still to do: a few hosting pieces (Key Vault, scale to zero, Application Insights, the read replica).

## Things to know

- Game state is stored as `json`, not `jsonb`. Postgres `jsonb` reorders keys and the engine sums floating-point numbers in key order, so a reloaded game could differ by a rounding error from a replayed one.
- The page does not hide a case's hidden truth from the player, since it plays on its own engine. That is fine for a single-player game but would need changing before any competitive mode.
- Not built yet: Key Vault, scale to zero, Application Insights and a read replica for the hosting.
