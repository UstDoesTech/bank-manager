-- Customers. A person (an invented name and how they look) is shared across games: the same name and look is one row however
-- many games they turn up in. Everything else belongs to one game and is kept apart from the game state: who became a regular
-- customer there, their age, manner and job in that game, and every time the bank served them. All invented.
-- Aligned to FIBO FND/AgentsAndPeople (Person) and BE/LegalEntities (customer relationship), and UOP Party and Party Role.

CREATE TABLE bank.person (
  person_id     bigserial PRIMARY KEY,
  person_key    text NOT NULL UNIQUE,                 -- a hash of the name and the look: the same name with another face is another person
  full_name     text NOT NULL,                        -- invented
  first_name    text NOT NULL,
  surname       text NOT NULL,
  heritage      text NOT NULL,                        -- the name pool: brit, sa_h, sa_m, wa, cb, ee, ea, se, me
  presentation  text NOT NULL CHECK (presentation IN ('f', 'm')),
  skin_tone     text NOT NULL,                        -- colour, as #rrggbb
  hair_colour   text NOT NULL,
  hair_style    text NOT NULL,
  headwear      text,                                 -- hijab, turban, flatcap, cap, beanie
  beard         text,                                 -- full, short, tache, goatee
  glasses       boolean NOT NULL,
  build         text NOT NULL CHECK (build IN ('slim', 'average', 'broad')),
  height        numeric(4, 3) NOT NULL,               -- relative to an average figure
  skirt         boolean NOT NULL,
  walking_stick boolean NOT NULL,
  bag           text,                                 -- handbag, backpack
  first_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bank.customer (
  game_id              uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  customer_id          integer NOT NULL,              -- the regular's number within the game
  person_id            bigint NOT NULL REFERENCES bank.person(person_id),
  born_year            integer NOT NULL,
  manner               text NOT NULL,                 -- calm, chatty, anxious, brisk, proud, cheerful, wary, flustered
  occupation           text,
  first_served_year    integer NOT NULL,
  first_served_month   integer NOT NULL,
  last_served_year     integer NOT NULL,
  last_served_month    integer NOT NULL,
  times_served         integer NOT NULL,
  has_mortgage         boolean NOT NULL DEFAULT false,
  left_bank            boolean NOT NULL DEFAULT false,
  PRIMARY KEY (game_id, customer_id)
);
CREATE INDEX customer_person ON bank.customer (person_id);

CREATE TABLE bank.customer_event (
  game_id      uuid NOT NULL,
  customer_id  integer NOT NULL,
  event_no     integer NOT NULL,                      -- 1 for the first time the bank served them, and so on
  command_seq  integer NOT NULL,                      -- the command during which it happened
  year         integer NOT NULL,
  month        integer NOT NULL,
  week         smallint CHECK (week BETWEEN 0 AND 3),  -- null in a game played a month at a time
  topic        text NOT NULL,                         -- the case and the answer, for example 'Bereavement · Ask for probate first'
  outcome      text NOT NULL,
  PRIMARY KEY (game_id, customer_id, event_no),
  FOREIGN KEY (game_id, customer_id) REFERENCES bank.customer(game_id, customer_id) ON DELETE CASCADE
);

ALTER TABLE bank.decision ADD COLUMN person_id bigint REFERENCES bank.person(person_id);
ALTER TABLE bank.decision ADD COLUMN customer_id integer;
ALTER TABLE bank.household ADD COLUMN person_id bigint REFERENCES bank.person(person_id);
COMMENT ON COLUMN bank.decision.person_id IS 'The person at the counter or on the alert, in a game with the cast; null otherwise.';
COMMENT ON COLUMN bank.decision.customer_id IS 'The regular customer this decision was about, when it was one.';

COMMENT ON TABLE bank.person IS 'FIBO FND/AgentsAndPeople Person; UOP Party. An invented name and look, shared across games. Synthetic.';
COMMENT ON TABLE bank.customer IS 'FIBO BE customer relationship; UOP Party Role. A regular customer in one game: age, manner, job, when first and last served. Synthetic.';
COMMENT ON TABLE bank.customer_event IS 'UOP Event. Each time the bank served a regular customer in one game, with the case, the answer and what happened.';

-- Analysis. Both views read only games that allow analysis, are synthetic and are not the training day (v_game).
-- How many customers came back, how often, and how many left, in each game.
CREATE VIEW bank.metric_customer AS
  SELECT c.game_id, g.difficulty,
    EXISTS (SELECT 1 FROM bank.decision d WHERE d.game_id = c.game_id AND d.week IS NOT NULL) AS weekly,
    count(*)::int AS customers,
    count(*) FILTER (WHERE c.times_served > 1)::int AS returning_customers,
    (count(*) FILTER (WHERE c.times_served > 1)::numeric / count(*))::numeric(6, 4) AS returning_share,
    avg(c.times_served)::numeric(6, 2) AS mean_times_served,
    (count(*) FILTER (WHERE c.left_bank)::numeric / count(*))::numeric(6, 4) AS left_share
  FROM bank.customer c JOIN bank.v_game g ON g.game_id = c.game_id
  GROUP BY c.game_id, g.difficulty;

-- Does a customer's manner go with how often they come back, or leave?
CREATE VIEW bank.metric_customer_manner AS
  SELECT c.manner, count(DISTINCT c.game_id)::int AS games, count(*)::int AS customers,
    avg(c.times_served)::numeric(6, 2) AS mean_times_served,
    (count(*) FILTER (WHERE c.left_bank)::numeric / count(*))::numeric(6, 4) AS left_share,
    (count(*) FILTER (WHERE c.has_mortgage)::numeric / count(*))::numeric(6, 4) AS mortgage_share
  FROM bank.customer c JOIN bank.v_game g ON g.game_id = c.game_id
  GROUP BY c.manner;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bank_analysis') THEN
    EXECUTE 'GRANT SELECT ON bank.metric_customer, bank.metric_customer_manner TO bank_analysis';
  END IF;
END $$;
