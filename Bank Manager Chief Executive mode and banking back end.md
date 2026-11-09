# Bank Manager: Chief Executive mode and banking back end

Oct 31, 2026 · @Ust Oldfield

## Summary

Chief Executive mode is an advanced mode, unlocked after a strong year as branch manager, in which the player sets the rules a bank runs on rather than judging each customer. Pricing, credit policy, treasury, funding and capital become the player's levers. The bank then makes thousands of decisions a month by those rules, and only the exceptions reach the counter and the inbox.

More controls mean more ways for things to go wrong. That is the point of the mode, and the design makes those failures learnable: areas unlock one at a time, an executive team warns of trouble, a stress test previews the downside, and early warning indicators show problems months before the losses.

To support this, the engine moves from the browser to a game server hosted in Azure, and every game is recorded as a working banking system in Lakebase, Databricks' managed Postgres. That record holds a double-entry ledger, customers who persist across years, accounts, loans, securities, hedges, and every decision linked to its true outcome. Lakebase is the only Databricks service the game needs.

## Goals and non-goals

The mode succeeds if a careful player learns why banks fail and the data it leaves behind reads like a real bank's.

**Goals**

- Teach how policy decisions compound: a rule applied a thousand times, priced against competitors, funded by deposits that can leave, and backed by limited capital.
- Keep the complexity learnable: one area at a time, warnings before losses, and a way to test settings before committing.
- Make every game a coherent banking dataset: a ledger that balances, customers who come back, and each decision linked to what actually happened.
- Keep branch manager mode playable on a phone, offline and without an account, in the published artifact version.

**Non-goals**

- A production core banking system or a real-money ledger.
- Data for training models that will be deployed: the data is synthetic and tuned for play, with defaults roughly tripled and time compressed.
- Multiplayer or a shared economy between players' banks.
- Logging from the published artifact version, which cannot send data to outside servers.

## Player experience

The player earns the job: a year rated A or better as branch manager brings an offer from the board to become chief executive. Players who have finished the training day can also start directly in this mode.

**Unlocks.** The board hands over one area at a time, each with a briefing letter and three quiet months to learn it: pricing first, then credit policy, treasury, funding and capital. Areas not yet unlocked run on sensible defaults set by the executive team.

**The executive team.** Four advisers comment on every setting from their own angle, and they often disagree:

- **Finance director:** profit, cost/income and the dividend shareholders expect.
- **Chief risk officer:** credit losses, limits and the stress test.
- **Treasurer:** liquidity, funding and interest-rate risk.
- **Head of operations:** staff capacity, alert backlogs and the change programme.

**The cycle.**

1. **Monthly executive meeting:** read the dashboard and the advisers' notes, then change settings. Changes take effect the following month.
2. **The month runs:** applications, payments and alerts are decided by your rules. Cases the rules refer, plus anything unusual, reach your counter and inbox as they do today.
3. **Month-end accounts:** the existing report, plus the bank's key ratios and early warning indicators.
4. **Quarterly board meeting:** set the dividend, confirm risk limits and hear the board's view of your performance.
5. **Annual review:** the regulator assesses capital and liquidity, the Fiscal Herald runs its front page, and the board decides whether you keep your job.

## The controls

Every control earns money when used well and carries a specific failure built into the simulation, so each mistake teaches something real.

| Control | Phase | What the player sets | The trap |
| --- | --- | --- | --- |
| Pricing | 1 | Savings, fixed bond, mortgage, personal loan and card rates, against a visible market average | Undercut the market and volume floods in at thin margins. Overprice and only borrowers nobody else will lend to accept. |
| Credit policy | 1 | Maximum loan to value and loan to income, minimum credit score, affordability test, and which cases are approved automatically | Loosen in a housing boom; when prices fall, loans exceed the value of the homes behind them. |
| Treasury and hedging | 1 | Reserves, short and long gilts, interest-rate swaps against fixed-rate mortgages | Leave fixed mortgages unhedged and a rate rise squeezes the margin. Over-hedge and a rate cut brings swap losses and collateral calls. |
| Capital and dividends | 1 | Dividend per quarter, share issues, the buffer kept above the regulatory minimum | Pay out too much and a downturn forces a share issue at the worst price. |
| Funding mix | 2 | Retail deposits, fixed-term bonds, borrowing from other banks, selling pools of mortgages | Wholesale borrowing is cheap until markets freeze and it cannot be renewed. |
| Operations | 2 | Staff numbers, fraud and money-laundering alert sensitivity, IT projects | Sensitive alerts block genuine customers and swamp staff. Lax alerts miss laundering. A rushed system migration causes an outage. |
| Incentives | 3 | Sales targets and staff bonuses | Sales rise, then mis-selling redress arrives years later. |
| Growth | 3 | New products, acquiring a smaller lender | An acquisition's hidden losses depend on how much was spent checking its loan book. |

## Managing complexity

Six mechanisms turn "more controls" into a fair challenge rather than noise. Each also mirrors how real banks manage the same problem.

| Mechanism | How it works in the game | Real-world counterpart |
| --- | --- | --- |
| Gradual unlocks | One area at a time, with a briefing and three quiet months | Executives take on portfolios in stages |
| Advisers who disagree | Four executives comment on each setting; their warnings are the main early signal | Executive committee challenge |
| Stress test | Before committing, run the current settings through a severe recession and see capital and liquidity at the low point | The Bank of England's annual stress test |
| Early warning indicators | Accounts one month behind, deposit concentration, repricing gap, alert backlog, growth in the riskiest lending | Risk appetite dashboards and limits |
| Commitments that can't be undone | Swaps, bond issues and fixed-rate mortgages have terms; a setting that can be reversed next month carries little risk | Duration and contractual lock-in |
| Change capacity | Each change running at once raises the chance of an operational incident; doing everything at once is itself a risk | Change risk and operational resilience rules |

The stress test runs inside the engine against the in-memory state. It does not create database branches, which are reserved for environments and analysis (see the back end section).

## Winning and losing

The chief executive is judged by the board and by shareholders, and can be sacked. Customer trust and regulator standing from branch manager mode carry over unchanged.

- **Board confidence (0–100):** rises with return on capital above peer banks, steady dividends and no surprises; falls with losses, missed targets, enforcement action and unforeseen incidents.
- **Share price:** book value per share times a multiple that rises when return on capital beats the cost of equity and falls with volatility and enforcement. Share issues dilute existing holders.
- **Being sacked:** board confidence below 20 at two quarterly meetings in a row, regulator enforcement action, or the bank failing. The player can also resign.
- **The Fiscal Herald:** gains chief-executive stories: dividend cuts, share issues, swap losses, acquisitions and, at worst, "Counting House chief executive ousted".
- **Rating:** keeps the existing letter scale, with the profit part judged against peer banks in the same economy.

## Year in review and ambitions

At the end of each year the player can replay it: a short account of how the capital ratio and monthly profit moved, the few decisions and months that mattered most and why, and one line on what cost the most. It teaches cause and effect that the rating alone does not. Ambitions give the career a longer horizon: ten optional goals that span years (for example five good years in a row, three clean years, a recession survived, three branches). They are checked as each year ends, change nothing in the game and do not affect the rating. They have no narrative and no opt-in, and they are not shown in the training day or the scenarios.

Ambitions are also written to the back end, one row per ambition for each finished year with the value reached, the target at the time and whether it is met, so analysis can ask how players performed against each target, by level of difficulty, and how long the ones who met it took.

## Rival banks

Once the player has unlocked the pricing controls, four invented rival banks appear, each with its own style: one pays savers well, one is the mainstream high-street bank, one is cheap on mortgages and one is a digital bank that matches the player's savings rate. They are a game option, so older games are unchanged. They give pricing a market to be judged against: savers compare the player's rate with the rivals' average, and a player who sets prices loses customers by charging more than the rivals do. Their behaviour is deterministic from the game's seed, the date and the player's own savings rate, so a replay is exact. Each month the engine's record of every rival's rates, deposits and share, and of the player's own rates and share, is written to the back end, so analysis can ask whether leading on savings rates paid, how often the player had the cheapest mortgage, and how market share moved by level of difficulty.

## Difficulty levels

A new career can be played at Gentle, Standard (the original tuning) or Hard. The level is chosen on the title screen and is part of the game's opening options, so it is recorded with the game and replays exactly. It scales credit losses, the chance of a market crash, the mix of economic paths from year to year, one extra funding scare on Hard, and the board's starting confidence. The regulator's limits and the board's removal level do not change. Ratings are not adjusted; they are shown with the level they were earned at. The training day and the scenarios ignore the level.

## Financial literacy

Bank Manager is strongest on how banks and money work and weakest on personal money management. Four changes now in the game close the biggest gaps against the standard literacy questions; two more are designed below.

Against the PISA financial literacy framework, the game covers the financial landscape and risk and reward well, money and transactions in part, and planning and managing finances hardly at all.

| Concept (Lusardi and Mitchell's "Big Five") | Coverage now | How the game teaches it |
| --- | --- | --- |
| Bond prices fall when rates rise | Strong | Gilts lose market value as Bank Rate rises; selling makes the loss real; the rate shock scenario is built on it |
| Diversification and risk | Good | Wealth suitability by time horizon and capacity for loss; depositor concentration |
| Mortgage cost over the term | Good (new) | Each mortgage application shows total interest over its term against a term 10 years shorter |
| Compound interest | Good (new) | Wealth clients get a growth illustration showing what a fee costs over their horizon against a cheap tracker fund |
| Inflation | Good (new) | Inflation moves with each economy; savings posters, rate decisions, the monthly outlook and the Herald show the real return on savings |

**Built into the game.**

- **For the customer:** after each approval, a yellow note gives the borrower's view: monthly repayment, its share of take-home pay, total repaid and total interest. A credit limit rise shows how long minimum payments would take to clear the balance.
- **Mortgage total interest:** on the application form, over the chosen term and a shorter one.
- **Real returns:** inflation is part of the economy in every year type and scenario, and every savings rate is shown against it.
- **Growth illustration:** on every wealth client's papers, plus the projected value in today's money after the decision.

Still to add: a one-line note on the year-end screen that default rates are about three times real-world levels and time is compressed for play.

### Recurring customers with simple finances

A small cast of named households returns year after year, so the player sees one family's money over time rather than a stream of strangers. This builds on the persistent customer base in the engine changes.

- **Cast:** six to eight households per game, drawn to cover the income range and life stages: a student, a young renter, a couple buying their first home, a family with children, a self-employed tradesperson, a retiree.
- **What each household has:** monthly income and essential spending, an emergency fund in months of spending, debts, a credit score, and a savings goal.
- **How it changes:** income moves with the economy and life events such as a new job, redundancy, a baby or retirement. Each decision the player makes about them shows up in their finances: a mortgage payment, an overdraft fee, a scam refund, a payment plan.
- **How the player sees it:** a household card opens from their name on any document or message, showing the budget as a simple bar and the credit score as a line over the years. When they return to the counter, the speech bubble refers to what happened last time.
- **What it teaches:** budgeting, the value of an emergency fund, how credit scores move with missed and on-time payments, and how one product decision plays out over years in a single household.

In the data model this adds `household` and `household_month` (income, spending, savings, debts, score), aligned to FIBO FND parties and UOP Party and Obligation.

### Year-end debrief

After the Herald, a short debrief ties the year's biggest moments to the concept behind each, so learning comes from the player's own play.

- **Format:** three to five cards, one per moment, chosen from the Herald stories and the player's costliest and best decisions.
- **Each card:** what happened in one sentence, the concept in one sentence, and one question to think about. For example: "Your 10-year gilts lost 14% of their value when Bank Rate rose. When interest rates rise, existing bonds are worth less. What would hedging have cost you?"
- **Tone:** written as notes from the executive team, not a test. The player can skip it.
- **Concept coverage:** each card is tagged with its PISA content area and Big Five question, so the debrief over several years rotates through all of them.

### Measuring learning

With the Lakebase back end, the game can show whether playing improves financial literacy, which is the evidence schools, funders and the Money and Pensions Service would ask for.

- **Before and after:** an optional five-question check, based on the Big Five, before a player's first game and again after each year of play.
- **Storage:** answers go in a `literacy_check` table keyed by player and attempt, alongside the `decision` table, so learning can be compared with how the player actually played.
- **Analysis:** SQL queries on the Lakebase read replica compare scores before and after, by concept and by how far the player progressed.

## Simulation engine changes

The engine moves from judging individual cases to modelling portfolios, while still sampling named customers for the counter and the ledger.

| Area | Today | Chief Executive mode |
| --- | --- | --- |
| Lending | One loan per stamped card | Cohorts by product, risk band and month of issue, each with balance, rate, probability of default, loss given default and arrears buckets (current, 30, 60, 90+ days). Named loans are drawn from cohorts. |
| Demand | A fixed number of cards a month | Applications per cohort set by market demand, the player's price against the market, and credit policy. Pricing and policy change the risk mix of who applies and who accepts. |
| Deposits | One savings rate | Products with their own rate sensitivity, stickiness and concentration in large depositors |
| Interest-rate risk | Gilts marked to market only | A repricing ladder for every asset and liability, net interest income sensitivity to a 1-point rate move, and swaps with notional, fixed rate, term and collateral |
| Funding | Deposits and Bank of England borrowing | Adds wholesale borrowing with renewal dates, market freezes, and mortgage pool sales with 5% of the risk retained |
| Capital | One ratio | Risk weights by cohort, a buffer the regulator can raise or lower, dividends and share issues |
| Operations | Fixed costs | Cases each member of staff can handle, alert sensitivity as a trade-off between detection and false alarms, and incident risk that rises with change load |
| Customers | New random people on every card | A persistent customer base: people open accounts, borrow later, fall behind in a downturn and complain |

The engine stays deterministic. A game is fully defined by its random seed, its engine version and the ordered list of player commands, which is what makes replay possible on the server.

## Phase 2 design: funding and operations

Phase 2 makes the player pay for the money they lend and for the people and systems that run the bank. Cheap funding and lean operations both look like good management until a bad month exposes them.

### Funding

The player chooses where the bank's money comes from. Each source differs in cost, how long it stays and how fast it leaves under stress.

| Source | Cost | How it behaves | Player controls |
| --- | --- | --- | --- |
| Easy-access savings | Lowest; set by the player against the market | Leaves gradually when the rate lags the market or trust falls; leaves fast in a run | Rate per balance tier |
| Fixed-term bonds | Above easy-access | Locked for 1, 2 or 3 years; can't leave early, but must be repaid or refinanced at maturity | Issue amount, term and rate |
| Large depositors | Negotiated | Housing associations, councils and firms; cheap and large, but one decision can move millions out | Accept, decline or cap each relationship |
| Wholesale borrowing | Bank Rate plus a spread that widens with market stress and the bank's own health | Borrowed from other banks for 3, 6 or 12 months; must be renewed at maturity | Amount and term per issue |
| Mortgage pool sales | A discount to book value that widens with market stress and pool quality | Sells a pool of mortgages to investors for cash; the bank keeps 5% of the risk and the first losses on it | Size of pool and which cohorts go in |
| Bank of England facilities | Bank Rate plus a margin, against loans as collateral with a haircut | Always available, but drawing on it hits board confidence and appears in the Herald | Amount drawn |

**Simulation model.**

- A **market stress index** moves each month with the economy and the scenario. High stress widens wholesale spreads and pool discounts; a freeze stops renewals entirely for several months.
- A **maturity ladder** buckets every inflow and outflow by when it falls due. The engine derives a simplified liquidity coverage ratio from it, plus a **survival horizon**: the number of days the bank could pay out in a severe run before cash runs out.
- **Deposit behaviour** varies by product: stickiness depends on the rate gap to the market, trust, and how much of the balance is above the deposit guarantee limit.
- **Concentration:** the share of deposits held by the ten largest depositors drives the size of single-depositor shocks.

**Traps and early warnings.**

| Trap | What it looks like before it goes wrong | Early warning shown |
| --- | --- | --- |
| Lending funded by cheap wholesale money | Strong growth and a good margin | Wholesale share of funding; maturity wall in the next 6 months |
| One big depositor | Cheap, stable funding for years | Top-10 depositor share |
| Selling pools to flatter results | A gain on sale and freed-up capital | Retained first-loss exposure; quality of what stayed on the books |
| Relying on the Bank of England | Problems solved overnight | Facility usage; board confidence trend |
| Too many bonds maturing at once | Low funding costs today | Survival horizon falling below 90 days |

### Operations

Operations turns cost cutting into a risk decision: every team has a capacity, and work beyond it becomes a backlog that ages into customer harm and regulatory breaches.

**Staffing.** Six teams each handle a number of cases per person per month: counter, credit referrals, fraud operations, financial crime, complaints and IT change.

- Demand above capacity joins a backlog. Each case has a service deadline, such as a complaint answer within 8 weeks or a suspicious activity review within the bank's own target.
- Hiring takes two months to arrive and a month to train, at a one-off cost. Overtime adds 20% capacity at a premium for up to three months.
- Attrition rises with sustained workload above 100%, which shrinks capacity further and can spiral.

**Alert sensitivity.** The player sets one threshold for fraud alerts and one for money-laundering alerts. The game shows the trade-off as a curve: the share of true cases caught against the share of alerts that turn out to be genuine customers.

| Setting | Detection | False alarms | Consequence |
| --- | --- | --- | --- |
| Very sensitive | High | Many | Genuine customers blocked, trust falls, analysts swamped and backlogs grow |
| Balanced | Moderate | Some | Workable if the teams are staffed for it |
| Lax | Low | Few | Fraud refunds, scam reimbursement shared with the receiving bank, missed laundering and fines months later |

The hidden truth on every case comes from the same model that branch manager mode uses, so detection and false-alarm rates are measured against real outcomes.

**Change programme.** The player approves IT and business projects, each with a cost, a duration, a benefit and a delivery risk.

| Project | Benefit | Specific risk |
| --- | --- | --- |
| Core banking migration | Lower running costs and faster product launches | Big-bang cutover risks a multi-day outage; a phased migration costs more and takes longer |
| Payments upgrade | Fewer failed payments, faster fraud checks | Outage during switchover |
| Regulatory reporting platform | Lower chance of reporting breaches | Delays if underfunded |
| Mobile app rebuild | Deposit growth, lower counter demand | Launch defects and complaints |
| Data and analytics platform | Better early warnings and fraud scoring | Benefits arrive slowly |

A **change capacity meter** sums the load of every running project. Above its limit, each month carries a rising chance of an incident: an outage, a data error or a missed regulatory report.

**Suppliers.** Card processing, the contact centre and IT hosting can be outsourced for lower running costs. Each supplier can suffer its own outage, and the regulator still holds the bank responsible, so oversight spending reduces both the chance and the impact.

**Traps and early warnings.**

| Trap | Early warning shown |
| --- | --- |
| Cutting staff to hit a cost/income target | Utilisation above 100%; oldest case age by team |
| Turning fraud alerts up after a bad month | Alerts per analyst; false-alarm rate; customer complaints about blocked payments |
| Turning money-laundering alerts down to clear a backlog | Alerts closed without review; regulator letters |
| Running too many projects at once | Change capacity meter; open incidents |
| Outsourcing without oversight | Supplier incident count; oversight spend per supplier |

## Phase 3 design: growth

Phase 3 lets the player grow the bank by launching products, buying other lenders and paying staff to sell. Each route adds revenue quickly and adds risk that surfaces slowly.

### New products

Products unlock from a catalogue. Launching one needs four things: a target market, a fair value assessment, a slot in the change programme and a marketing budget.

| Product | What it adds | Specific risk |
| --- | --- | --- |
| Buy-to-let mortgages | Higher margins than residential mortgages | Losses rise when rents fall or rates rise; borrowers' rent cover is the key check |
| Small business overdrafts and asset finance | Fee income, sticky business relationships | Sector downturns hit whole cohorts at once |
| ISAs and regular savers | Sticky deposits within annual allowances | Costly rates; savers move at the start of each tax year |
| Credit builder card | New customers who become profitable later | High early losses; vulnerability and persistent-debt rules |
| Buy now, pay later | Fast volume and merchant fees | High losses, thin margins, conduct scrutiny |
| Packaged accounts with insurance | Monthly fee income | Mis-selling to customers who can't claim on the insurance |
| Green home improvement loans | Demand from homeowners, positive Herald coverage | Supplier fraud by installers |

**Product lifecycle.** Volume grows through launch, peaks, then settles as competitors respond. The regulator runs fair value reviews on any product whose fees are high relative to the benefit customers receive. A failed review forces refunds and repricing. Withdrawing a product leaves existing customers on the books for the life of their agreements.

### Acquisitions

Offers to buy smaller lenders arrive through the inbox: a car finance lender, a building society's mortgage book, or a fintech with an app and young customers.

- **Due diligence depth:** light, standard or deep, at rising cost and time. Deeper checks reveal more of the target's hidden truth: the real default rates in its loan book, conduct problems such as undisclosed commission, and the state of its systems.
- **Price against book value:** paying above book creates goodwill, which is deducted from capital in full. An expensive deal can push the capital ratio below its minimum on completion day.
- **Integration:** moving the acquired customers onto the bank's systems consumes change capacity, risks an outage, and loses some customers. Promised cost savings arrive over 12 to 24 months, if integration goes well.
- **Hidden losses:** whatever diligence missed arrives over the following years as defaults and redress, and a goodwill write-down if the deal underperforms.

**Traps and early warnings.**

| Trap | Early warning shown |
| --- | --- |
| Launching fast-growing products with thin margins | Loss rate by product and month of issue against the margin |
| Too many launches at once | Change capacity meter; products awaiting fair value review |
| Paying a premium for growth | Goodwill as a share of capital |
| Light diligence on a cheap deal | Diligence coverage score; arrears trend in the acquired book |
| Integration slipping | Integration progress against plan; customer losses from the acquired book |

### Incentives and conduct

The player designs how staff are rewarded, and the engine tracks a hidden culture score that the incentives push up or down.

- **Scheme design:** a sales target per team, the share of bonus tied to sales volume, and the share tied to quality measures such as complaints, arrears and file checks.
- **Effect on sales:** volume-heavy schemes raise sales within a quarter.
- **Effect on conduct:** each sale made under pressure carries a hidden mis-selling flag. Complaints arrive one to three years later, then redress with interest. A pattern triggers an independent review commissioned by the regulator, at the bank's cost.
- **Signals:** whistleblower reports appear in the inbox when the culture score falls. Acting on them early is cheap; ignoring them is not.
- **Remedies:** quality gates on sales, clawback of past bonuses, and retraining. Each costs morale and short-term sales.

### Branch network

The player can open branches, replace them with shared banking hubs, or close them, town by town. Each town has a population, an age profile and a share of customers who rely on cash.

- **Opening** costs money upfront and brings local deposits and lending after a ramp-up.
- **Closing** saves running costs at once, but loses some deposits and hits trust hardest in towns with older, cash-reliant customers. Closing the last bank in a town makes the Herald.
- **Hubs** are the middle path: lower cost, fewer services, less damage to trust.

**Traps and early warnings.**

| Trap | Early warning shown |
| --- | --- |
| Volume-heavy bonuses | Sales against complaints per 1,000 sales; whistleblower reports |
| Ignoring early complaints | Complaints upheld by the Ombudsman, by product |
| Closing branches to hit cost targets | Trust by town; share of vulnerable customers affected |

### Data and metrics added by phases 2 and 3

| Table | Holds | Alignment |
| --- | --- | --- |
| `funding_instrument` | Bonds, wholesale borrowing and central bank drawings: amount, rate, start, maturity | FIBO SEC debt instruments; FBC |
| `securitisation_pool`, `pool_member` | Mortgage pools sold, the loans in each, the retained share | FIBO SEC asset-backed securities |
| `liquidity_ladder` | Inflows and outflows by maturity bucket each month | Returns-style layout |
| `team_month` | Headcount, capacity, demand, backlog and attrition per team | UOP Party |
| `change_project`, `incident` | Projects with cost, load and status; incidents with cause and impact | UOP Agreement and Event |
| `supplier` | Outsourced services, oversight spend, outages | FIBO FND parties |
| `product`, `product_review` | Catalogue, launch and withdrawal dates, fair value reviews | FIBO FBC products and services |
| `acquisition` | Target, price, diligence depth, goodwill, integration progress | FIBO BE ownership and control |
| `incentive_scheme`, `sale` | Scheme rules over time, and the scheme in force for every sale | UOP Policy and Obligation |
| `branch_site` | Towns, branch type, opening and closing dates | FIBO FND places; UOP Location |

New metrics: loan-to-deposit ratio, survival horizon, wholesale funding share, top-10 depositor share, oldest case age by team, false-alarm rate, change load, profit and complaints by product, goodwill as a share of capital, and complaints per 1,000 sales. All sit in the same Lakebase metric views as phase 1.

**Balancing gates.** Phase 2 ships when a funding strategy that ignores the survival horizon fails in at least the funding freeze scenario, and a lean-staffing strategy fails on backlogs. Phase 3 ships when no single product, acquisition or incentive scheme beats balanced play in every economy.

## Banking system back end on Lakebase

The game runs outside Databricks, on Azure. Its server runs the engine and records each game in a Lakebase Postgres project, the system of record and the only Databricks service required.

&#91;embedded content: back end architecture · 3 components\]

Only the game server talks to the database.

**Hosting in Azure.** The game runs as an Azure Container App: one Node.js container serves the three.js front end and runs the engine, scaling to zero between games. Native Azure services cover the rest: Container Registry for images, Key Vault for secrets, Communication Services for verification and reset emails, and Application Insights for logs. Players never need a Databricks account.

**Player accounts.** Players register with an email address and a password, confirm the address through an emailed link, then sign in with the same pair. The game server keeps accounts in Lakebase in a separate `account` schema, with passwords hashed using Argon2id and never stored or logged in plain text. A signed-in player holds a secure, HTTP-only session cookie, failed sign-ins are rate-limited, and a forgotten password is reset through an emailed link that expires.

**Connecting to Lakebase.** The server connects over Postgres with TLS through the `@databricks/lakebase` pool, which refreshes the hour-long OAuth tokens. It authenticates as a Databricks service principal whose secret sits in Azure Key Vault, read through a managed identity. No Databricks Apps, jobs or clusters are involved.

**Commands in, events and state out.** The browser sends commands, such as stamping a mortgage, setting a mortgage rate or entering a swap. The game server validates each command, runs the engine, and writes the command, the resulting events and the changed state in one Postgres transaction. Nothing financial is computed in the browser in this mode.

**Replay.** Because a game is its seed, engine version and ordered commands, any game can be rebuilt from scratch. That allows schema changes to be backfilled, engine fixes to be checked against thousands of real games, and investigation of any outcome.

**A real ledger.** Every financial effect is a journal entry whose lines sum to zero across a chart of accounts. Interest, fees, impairments, redress, swap settlements and dividends all post as entries. Balances are derived from the journal, and a database constraint rejects any entry that doesn't balance.

**Month end as a batch.** Closing a month runs in one transaction: interest accrual, repayments, arrears movements, impairment, market moves and a snapshot of every position.

**Lakebase features used.**

- **One project, three branches:** production, test and development. Branches are copy-on-write, so a schema migration can be tried on a branch holding real game data before it reaches production.
- **Branches for analysis, not players:** a project allows 10 active branches and temporary branches last at most 30 days, so branches are for designers replaying games under a new engine version, never one per player.
- **Autoscaling with scale-to-zero:** idle compute shuts down and wakes in about 100 ms on the next connection, which suits uneven game traffic. A read replica serves leaderboards and history screens.
- **Postgres access only through the game server:** the browser never connects to the database. The Data API stays off unless a later feature needs it, in which case row-level security restricts each player to their own games.

**Multi-tenancy.** All games share one schema, keyed by game, with indexes leading on the game key. A small bank's year is a few thousand rows of state and tens of thousands of journal lines, so one project serves many players.

**Branch manager games are recorded too.** Both modes write to Lakebase when played through the Azure-hosted game, which builds a larger decision dataset. In branch manager mode each counter or inbox decision is a command, stored with the case's hidden truth as its true outcome. Only the published artifact version keeps running entirely in the browser with local saves.

## Data model

The schema is a lean banking model, with FIBO used as the reference vocabulary rather than the physical design. Each table and column carries its FIBO term in a Postgres comment. Where FIBO has no coverage, the Universal Ontology Platform primitives fill the gap.

| Table | Holds | Alignment |
| --- | --- | --- |
| `game` | Seed, mode, scenario, engine version, status, player | Game metadata |
| `command` | Ordered player commands with their parameters | Game metadata (the replay source) |
| `event` | Everything the engine emits: applications, alerts, rate changes, incidents | FIBO FND occurrences; UOP Event |
| `party` | Customers, businesses, counterparties and the bank itself | FIBO FND parties; BE for legal entities |
| `party_role` | Depositor, borrower, guarantor, wealth client | FIBO FND party roles |
| `account` | Current accounts, easy-access savings, fixed-term bonds | FIBO FBC accounts |
| `agreement` | Mortgages, personal loans, business loans, cards: terms, rate, status | FIBO LOAN; FND agreements |
| `collateral` | Property value at origination and the index used to revalue it | FIBO LOAN, real-estate collateral; UOP Asset |
| `security_holding` | Gilts: nominal, coupon, maturity, book and market value | FIBO SEC debt instruments |
| `hedge` | Interest-rate swaps: notional, fixed rate, term, collateral posted | FIBO DER swaps |
| `gl_account`, `journal_entry`, `journal_line` | Chart of accounts and the double-entry journal | FIBO FND accounting (partial) |
| `position_snapshot` | Month-end state of every agreement, account and holding | FIBO LOAN status; FND accounting |
| `market_state` | Bank Rate, unemployment, house prices, share index per month | FIBO IND indicators |
| `policy_setting` | Every pricing rule, credit rule and limit, with the month it took effect | UOP Policy |
| `case` | Fraud alerts, money-laundering alerts, sanctions hits, complaints | UOP Claim and Event |
| `document` | ID, payslip, credit file and other papers shown on the desk | UOP Document |
| `decision` | Who decided what, the options shown, the rule or person that decided, and the hidden true outcome | UOP Event |
| `regulatory_snapshot` | Capital ratio, risk-weighted assets, liquidity, buffers per month | No FIBO coverage; returns-style layout |

The `decision` table is the most valuable in the set. It pairs each decision with the truth the engine knew, so it can compare people, rules and models on fraud, money laundering and credit.

These tables cover phase 1. Phases 2 and 3 add 14 more, listed at the end of the phase 3 design.

## Metrics and semantic layer

The metrics are defined once as SQL views in Lakebase, so every game screen uses the same definitions. They can be exported as an Apache Ossie (formerly Open Semantic Interchange) model as that specification's financial services work matures.

| Metric | Definition | Grain |
| --- | --- | --- |
| Net interest margin | Interest earned minus interest paid, annualised, over average total assets | Bank × month |
| Cost/income | Operating costs over net interest income plus fees | Bank × month |
| Cost of risk | Impairment charges, annualised, over average loans | Bank or cohort × month |
| Capital ratio | Capital over risk-weighted assets | Bank × month |
| Liquidity ratio | Reserves plus gilts at market value over deposits | Bank × month |
| Rate sensitivity | Change in 12-month net interest income for a 1-point rise in Bank Rate | Bank × month |
| Arrears rate | Balance 30+ and 90+ days behind over total balance | Cohort × month |
| Fraud detection and false alarms | Share of true frauds blocked; share of blocks that were genuine | Bank × month |
| Decision accuracy | Share of decisions consistent with the true outcome, by person or rule | Decision maker × case type |
| Return on capital against peers | Profit over opening capital, minus the peer benchmark for the year's economy | Bank × year |

## Privacy, consent and security

The customers in the game are invented, but each player's decisions are still data about that player, so they are treated as personal data.

- **Pseudonymous players:** the `game` table stores an opaque player key that points to the player's account, never a name or email address. Email addresses and password hashes sit only in the separate account schema.
- **Notice:** the only notice is about the cookie that records game sessions, shown once on a first visit. There is no other notice and no opt-out: recording is part of playing the online game. Playing the file offline records nothing.
- **Synthetic flag:** every party and agreement is marked synthetic, so game data cannot be mistaken for real customer data anywhere downstream.
- **Deletion:** deleting a player removes their account (email, password, sessions). Games are never deleted: they hold only an opaque player key, so once the account row is gone nothing links them to a person, and they stay in Lakebase for analysis.
- **Access:** the game server's Databricks service principal owns the game schema and its secret stays in Azure Key Vault; analysis uses a separate read-only role on the read replica.

## Delivery phases

The back end comes first, so every game played through Azure, in either mode, is recorded from its first release.

&#91;embedded content: delivery phases · 4 phases, 3 gates\]

Each gate is checked with the existing simulation harness before the next phase starts.

## Risks

| Risk | Mitigation |
| --- | --- |
| Too many controls overwhelm players | Unlocks, advisers, the stress test and defaults for anything not yet unlocked; test with the simulated player types already used for balancing |
| The portfolio engine is harder to balance than card-by-card play | Keep the simulation harness; require careful play to beat reckless play by a clear margin in every economy before release |
| Month-end transactions grow with the bank | Cohort-level postings for routine interest; named-loan postings only for loans that are sampled or in arrears |
| Phone screens can't hold a dashboard plus settings | One control area per screen, with the stress test result always visible |
