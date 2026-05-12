-- Seed data for development/testing

-- Insert a demo player
INSERT INTO players (id, nickname, email, is_guest) VALUES
  ('00000000-0000-0000-0000-000000000001', 'DemoHost', 'demo@bingo.local', false)
ON CONFLICT DO NOTHING;

-- Insert a demo game (code: TEST)
INSERT INTO games (id, code, host_token, host_player_id, status, mode, number_range_min, number_range_max) VALUES
  (
    '00000000-0000-0000-0000-000000000010',
    'TEST',
    'demo-host-token-do-not-use',
    '00000000-0000-0000-0000-000000000001',
    'waiting',
    ARRAY['linha','coluna'],
    1,
    75
  )
ON CONFLICT DO NOTHING;
