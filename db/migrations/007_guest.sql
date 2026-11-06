-- Anonymous players. A guest has a player key and a session cookie but no email or password, so games played without
-- signing in are recorded under an opaque key like any other. Registering later claims the same row, keeping the games.
ALTER TABLE account.player ALTER COLUMN email DROP NOT NULL;
ALTER TABLE account.player ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE account.player ADD COLUMN guest boolean NOT NULL DEFAULT false;
ALTER TABLE account.player ADD CONSTRAINT player_guest_or_account
  CHECK (guest OR (email IS NOT NULL AND password_hash IS NOT NULL));
