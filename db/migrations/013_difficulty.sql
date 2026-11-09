-- The level a game was played at: gentle, standard or hard. It comes from the game's opening options and never changes.
ALTER TABLE bank.game ADD COLUMN difficulty text NOT NULL DEFAULT 'standard' CHECK (difficulty IN ('gentle', 'standard', 'hard'));
COMMENT ON COLUMN bank.game.difficulty IS 'Set when the game starts (the newGame command''s difficulty option). Standard is the original tuning.';

-- The analysis views read games through v_game, so the level is there too (a new last column; the views built on it are unaffected).
CREATE OR REPLACE VIEW bank.v_game AS
  SELECT id AS game_id, difficulty FROM bank.game WHERE in_analysis AND synthetic AND NOT tutorial;
