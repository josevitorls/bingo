import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { subscribeToGame } from '../lib/realtime';
import type { Game, GamePlayer } from '../types';

interface GameState {
  game: Game | null;
  players: GamePlayer[];
  loading: boolean;
  error: string | null;
}

export function useGame(code: string | null) {
  const [state, setState] = useState<GameState>({
    game: null,
    players: [],
    loading: true,
    error: null,
  });

  const fetchGame = useCallback(async () => {
    if (!code) return;

    setState((s) => ({ ...s, loading: true, error: null }));

    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('*')
      .eq('code', code)
      .maybeSingle();

    if (gameError) {
      setState((s) => ({ ...s, loading: false, error: gameError.message }));
      return;
    }

    if (!game) {
      setState((s) => ({ ...s, loading: false, error: 'Game not found' }));
      return;
    }

    const { data: players, error: playersError } = await supabase
      .from('game_players')
      .select('*, players(*)')
      .eq('game_id', game.id);

    if (playersError) {
      setState((s) => ({ ...s, loading: false, error: playersError.message }));
      return;
    }

    setState({
      game: game as Game,
      players: (players || []) as GamePlayer[],
      loading: false,
      error: null,
    });
  }, [code]);

  useEffect(() => {
    fetchGame();
  }, [fetchGame]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!code) return;

    const unsubscribe = subscribeToGame(code, (msg) => {
      if (msg.type === 'draw') {
        const payload = msg.payload as { number: number; drawnNumbers: number[] };
        setState((s) => {
          if (!s.game) return s;
          return {
            ...s,
            game: {
              ...s.game,
              drawn_numbers: payload.drawnNumbers,
            },
          };
        });
      } else if (msg.type === 'status') {
        const payload = msg.payload as { status: Game['status'] };
        setState((s) => {
          if (!s.game) return s;
          return {
            ...s,
            game: { ...s.game, status: payload.status },
          };
        });
      } else if (msg.type === 'players') {
        // Refetch players on change
        fetchGame();
      } else if (msg.type === 'bingo') {
        const payload = msg.payload as { playerId: string };
        setState((s) => ({
          ...s,
          players: s.players.map((p) =>
            p.player_id === payload.playerId
              ? { ...p, bingo_claimed: true, bingo_claimed_at: new Date().toISOString() }
              : p
          ),
        }));
      } else if (msg.type === 'verify') {
        const payload = msg.payload as { gamePlerId: string; verified: boolean };
        setState((s) => ({
          ...s,
          players: s.players.map((p) =>
            p.id === payload.gamePlerId
              ? { ...p, bingo_verified: payload.verified }
              : p
          ),
        }));
      }
    });

    return unsubscribe;
  }, [code, fetchGame]);

  const setState_draw = useCallback((drawnNumbers: number[]) => {
    setState((s) =>
      s.game ? { ...s, game: { ...s.game, drawn_numbers: drawnNumbers } } : s
    );
  }, []);

  const setState_playerVerified = useCallback((gpId: string, verified: boolean) => {
    setState((s) => ({
      ...s,
      players: s.players.map((p) =>
        p.id === gpId ? { ...p, bingo_verified: verified } : p
      ),
    }));
  }, []);

  const setState_resetClaim = useCallback((gpId: string) => {
    setState((s) => ({
      ...s,
      players: s.players.map((p) =>
        p.id === gpId ? { ...p, bingo_claimed: false, bingo_verified: null } : p
      ),
    }));
  }, []);

  return {
    game: state.game,
    players: state.players,
    loading: state.loading,
    error: state.error,
    refetch: fetchGame,
    setState_draw,
    setState_playerVerified,
    setState_resetClaim,
  };
}
