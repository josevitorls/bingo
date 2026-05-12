export type GameStatus = 'waiting' | 'running' | 'finished';

export type GameMode =
  | 'linha'
  | 'coluna'
  | 'diagonal'
  | 'cartela_cheia'
  | 'primeiro'
  | 'ultimo';

export interface Player {
  id: string;
  nickname: string;
  email?: string;
  created_at: string;
  is_guest: boolean;
}

export interface Game {
  id: string;
  code: string;
  host_token: string;
  host_player_id: string | null;
  status: GameStatus;
  mode: GameMode[];
  number_range_min: number;
  number_range_max: number;
  drawn_numbers: number[];
  auto_draw_interval: number | null;
  winner_player_id: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface BingoCardData {
  numbers: number[][];
  marked: boolean[][];
}

export interface GamePlayer {
  id: string;
  game_id: string;
  player_id: string;
  card: BingoCardData;
  bingo_claimed: boolean;
  bingo_claimed_at: string | null;
  bingo_verified: boolean | null;
  joined_at: string;
  players?: Player;
}

export interface DrawEvent {
  id: string;
  game_id: string;
  number: number;
  drawn_at: string;
}

export interface BingoCheck {
  hasPartialBingo: boolean;
  hasFullBingo: boolean;
  completedRows: number[];
  completedCols: number[];
  completedDiagonals: ('main' | 'anti')[];
  isFullCard: boolean;
}
