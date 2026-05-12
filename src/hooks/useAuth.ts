import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Player } from '../types';

interface AuthState {
  player: Player | null;
  loading: boolean;
}

const PLAYER_KEY = 'bingo_player';

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    player: null,
    loading: true,
  });

  useEffect(() => {
    // Try to restore from localStorage
    const stored = localStorage.getItem(PLAYER_KEY);
    if (stored) {
      try {
        const player = JSON.parse(stored) as Player;
        setState({ player, loading: false });
        return;
      } catch {
        localStorage.removeItem(PLAYER_KEY);
      }
    }
    setState((s) => ({ ...s, loading: false }));
  }, []);

  const createGuest = useCallback(async (nickname: string): Promise<Player> => {
    const { data, error } = await supabase
      .from('players')
      .insert({ nickname, is_guest: true })
      .select()
      .single();

    if (error) throw error;
    const player = data as Player;
    localStorage.setItem(PLAYER_KEY, JSON.stringify(player));
    setState({ player, loading: false });
    return player;
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<Player> => {
    // Simple password-based lookup (in production, use proper auth)
    // For now we store hashed password check via supabase function or direct
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const passwordHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    const { data: players, error } = await supabase
      .from('players')
      .select()
      .eq('email', email)
      .eq('password_hash', passwordHash)
      .maybeSingle();

    if (error) throw error;
    if (!players) throw new Error('Invalid credentials');

    const player = players as Player;
    localStorage.setItem(PLAYER_KEY, JSON.stringify(player));
    setState({ player, loading: false });
    return player;
  }, []);

  const register = useCallback(async (email: string, password: string, nickname: string): Promise<Player> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const passwordHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    const { data: player, error } = await supabase
      .from('players')
      .insert({ email, password_hash: passwordHash, nickname, is_guest: false })
      .select()
      .single();

    if (error) throw error;
    const p = player as Player;
    localStorage.setItem(PLAYER_KEY, JSON.stringify(p));
    setState({ player: p, loading: false });
    return p;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(PLAYER_KEY);
    setState({ player: null, loading: false });
  }, []);

  return {
    player: state.player,
    loading: state.loading,
    createGuest,
    login,
    register,
    logout,
  };
}
