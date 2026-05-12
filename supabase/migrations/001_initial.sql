-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname text NOT NULL,
  email text UNIQUE,
  password_hash text,
  created_at timestamptz DEFAULT now(),
  is_guest boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code char(4) NOT NULL UNIQUE,
  host_token text NOT NULL,
  host_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'running', 'finished')),
  mode text[] NOT NULL DEFAULT '{"linha"}',
  number_range_min int NOT NULL DEFAULT 1,
  number_range_max int NOT NULL DEFAULT 75,
  drawn_numbers int[] NOT NULL DEFAULT '{}',
  auto_draw_interval int,
  winner_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  finished_at timestamptz
);

CREATE TABLE IF NOT EXISTS game_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  card jsonb NOT NULL,
  bingo_claimed boolean NOT NULL DEFAULT false,
  bingo_claimed_at timestamptz,
  bingo_verified boolean,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(game_id, player_id)
);

CREATE TABLE IF NOT EXISTS draw_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  number int NOT NULL,
  drawn_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS card_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  card_hash text NOT NULL,
  game_id uuid REFERENCES games(id) ON DELETE SET NULL,
  used_at timestamptz DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_games_code ON games(code);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_game_players_game_id ON game_players(game_id);
CREATE INDEX IF NOT EXISTS idx_game_players_player_id ON game_players(player_id);
CREATE INDEX IF NOT EXISTS idx_draw_events_game_id ON draw_events(game_id);
CREATE INDEX IF NOT EXISTS idx_card_history_player_id ON card_history(player_id);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Validate host token for a game
CREATE OR REPLACE FUNCTION validate_host_token(game_code text, token text)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM games
    WHERE code = game_code AND host_token = token
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Draw a number for a game (host only)
CREATE OR REPLACE FUNCTION draw_number(game_code text, host_token_input text)
RETURNS int AS $$
DECLARE
  game_record games%ROWTYPE;
  available_numbers int[];
  drawn_num int;
  pool_size int;
  random_index int;
BEGIN
  -- Validate host
  SELECT * INTO game_record FROM games
  WHERE code = game_code AND host_token = host_token_input AND status = 'running';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized or game not running';
  END IF;

  -- Build available pool
  SELECT ARRAY(
    SELECT n FROM generate_series(game_record.number_range_min, game_record.number_range_max) n
    WHERE n <> ALL(game_record.drawn_numbers)
  ) INTO available_numbers;

  pool_size := array_length(available_numbers, 1);
  IF pool_size IS NULL OR pool_size = 0 THEN
    RAISE EXCEPTION 'No numbers left to draw';
  END IF;

  -- Pick random number
  random_index := floor(random() * pool_size)::int + 1;
  drawn_num := available_numbers[random_index];

  -- Update game
  UPDATE games
  SET drawn_numbers = array_append(drawn_numbers, drawn_num)
  WHERE id = game_record.id;

  -- Insert draw event
  INSERT INTO draw_events(game_id, number) VALUES (game_record.id, drawn_num);

  RETURN drawn_num;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update game status (host only)
CREATE OR REPLACE FUNCTION update_game_status(game_code text, host_token_input text, new_status text)
RETURNS void AS $$
BEGIN
  UPDATE games
  SET
    status = new_status,
    finished_at = CASE WHEN new_status = 'finished' THEN now() ELSE finished_at END
  WHERE code = game_code AND host_token = host_token_input;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized or game not found';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verify bingo claim (host only)
CREATE OR REPLACE FUNCTION verify_bingo(game_code text, host_token_input text, gp_id uuid, is_valid boolean)
RETURNS void AS $$
BEGIN
  -- Validate host
  IF NOT validate_host_token(game_code, host_token_input) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE game_players gp
  SET bingo_verified = is_valid
  FROM games g
  WHERE gp.id = gp_id
    AND gp.game_id = g.id
    AND g.code = game_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE draw_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_history ENABLE ROW LEVEL SECURITY;

-- players: anyone can insert (guest creation), read all
CREATE POLICY "players_select" ON players FOR SELECT USING (true);
CREATE POLICY "players_insert" ON players FOR INSERT WITH CHECK (true);
CREATE POLICY "players_update_own" ON players FOR UPDATE USING (true);

-- games: anyone can read; insert open; updates via functions
CREATE POLICY "games_select" ON games FOR SELECT USING (true);
CREATE POLICY "games_insert" ON games FOR INSERT WITH CHECK (true);
CREATE POLICY "games_update" ON games FOR UPDATE USING (true);

-- game_players: anyone can read; insert open (joining); update own card marks
CREATE POLICY "gp_select" ON game_players FOR SELECT USING (true);
CREATE POLICY "gp_insert" ON game_players FOR INSERT WITH CHECK (true);
CREATE POLICY "gp_update" ON game_players FOR UPDATE USING (true);

-- draw_events: read only
CREATE POLICY "draw_events_select" ON draw_events FOR SELECT USING (true);
CREATE POLICY "draw_events_insert" ON draw_events FOR INSERT WITH CHECK (true);

-- card_history: open read/write
CREATE POLICY "card_history_select" ON card_history FOR SELECT USING (true);
CREATE POLICY "card_history_insert" ON card_history FOR INSERT WITH CHECK (true);
