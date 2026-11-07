-- Operations: team capacity and backlogs, the change programme, incidents and suppliers.
CREATE TABLE bank.team_month (
  game_id     uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  year        integer NOT NULL,
  month       integer NOT NULL,
  team        text NOT NULL,
  staff       integer NOT NULL,
  demand      numeric(10, 1) NOT NULL,                                 -- cases that arrived
  capacity    numeric(10, 1) NOT NULL,                                 -- cases the team could handle
  backlog     numeric(10, 1) NOT NULL,                                 -- cases carried to next month
  utilisation numeric(6, 3) NOT NULL,                                  -- demand over capacity
  PRIMARY KEY (game_id, year, month, team)
);
CREATE TABLE bank.change_project (
  game_id     uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  project     text NOT NULL,
  mode        integer NOT NULL,                                        -- core banking: 1 phased, 2 big-bang
  start_abs   integer NOT NULL,                                        -- year * 12 + month
  months      integer NOT NULL,
  cost_pence  bigint NOT NULL,
  status      text NOT NULL CHECK (status IN ('running', 'done', 'stopped')),
  PRIMARY KEY (game_id, project)
);
CREATE TABLE bank.incident (
  game_id     uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  incident_id integer NOT NULL,
  year        integer NOT NULL,
  month       integer NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('outage', 'data', 'report')),
  cause       text NOT NULL,
  cost_pence  bigint NOT NULL,
  PRIMARY KEY (game_id, incident_id)
);
CREATE TABLE bank.supplier (
  game_id         uuid NOT NULL REFERENCES bank.game(id) ON DELETE CASCADE,
  supplier        text NOT NULL,
  outsourced      boolean NOT NULL,
  oversight_pence bigint NOT NULL,                                     -- spent each month
  incidents       integer NOT NULL,
  PRIMARY KEY (game_id, supplier)
);
COMMENT ON TABLE bank.team_month IS 'Headcount, capacity, demand and backlog per team per month. UOP Party. Synthetic.';
COMMENT ON TABLE bank.change_project IS 'Change programme projects. UOP Agreement. Synthetic.';
COMMENT ON TABLE bank.incident IS 'Outages, data errors and missed reports with cause and cost. UOP Event. Synthetic.';
COMMENT ON TABLE bank.supplier IS 'Outsourced services and oversight spend. FIBO FND parties. Synthetic.';
