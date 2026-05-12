import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import type { Game, GamePlayer } from '../types';

interface GameHistoryEntry {
  game: Game;
  gamePlayer: GamePlayer;
}

interface RankingEntry {
  player_id: string;
  nickname: string;
  wins: number;
}

export const Profile: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { player, logout } = useAuth();

  const [history, setHistory] = useState<GameHistoryEntry[]>([]);
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!player) {
      navigate('/auth');
      return;
    }

    const fetchData = async () => {
      setLoading(true);

      // Fetch game history
      const { data: gps } = await supabase
        .from('game_players')
        .select('*, games(*)')
        .eq('player_id', player.id)
        .order('joined_at', { ascending: false })
        .limit(20);

      if (gps) {
        const entries: GameHistoryEntry[] = (gps as (GamePlayer & { games: Game })[])
          .filter((gp) => gp.games)
          .map((gp) => ({
            game: gp.games,
            gamePlayer: gp,
          }));
        setHistory(entries);
      }

      // Fetch simple ranking: count verified bingos per player
      const { data: bingos } = await supabase
        .from('game_players')
        .select('player_id, players(nickname)')
        .eq('bingo_verified', true);

      if (bingos) {
        const counts: Record<string, { nickname: string; wins: number }> = {};
        for (const b of bingos as unknown as Array<{ player_id: string; players: { nickname: string } | null }>) {
          if (!counts[b.player_id]) {
            counts[b.player_id] = {
              nickname: b.players?.nickname ?? 'Anônimo',
              wins: 0,
            };
          }
          counts[b.player_id].wins++;
        }
        const sorted = Object.entries(counts)
          .map(([player_id, d]) => ({ player_id, ...d }))
          .sort((a, b) => b.wins - a.wins)
          .slice(0, 10);
        setRanking(sorted);
      }

      setLoading(false);
    };

    fetchData();
  }, [player, navigate]);

  if (!player) return null;

  const gamesPlayed = history.length;
  const gamesWon = history.filter((h) => h.gamePlayer.bingo_verified === true).length;

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <button
              className="text-white/60 hover:text-white text-2xl"
              onClick={() => navigate('/')}
            >
              ←
            </button>
            <h1
              className="font-title text-3xl sm:text-4xl"
              style={{ color: 'var(--gold)' }}
            >
              {t('profile.title')}
            </h1>
          </div>
          <button className="btn-danger text-sm px-4 py-2" onClick={logout}>
            {t('auth.logout')}
          </button>
        </div>

        {/* Player info */}
        <div className="glass-card p-6 mb-6 flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold flex-shrink-0"
            style={{ background: 'var(--gold)', color: 'var(--dark)' }}
          >
            {player.nickname.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="text-xl font-bold">{player.nickname}</div>
            {player.email && (
              <div className="text-sm text-white/50">{player.email}</div>
            )}
            <div className="text-xs text-white/40 mt-1">
              {player.is_guest ? 'Convidado' : 'Membro'}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="glass-card p-6 mb-6">
          <h2 className="font-bold text-white/90 mb-4">{t('profile.stats')}</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.07)' }}>
              <div className="text-3xl font-title" style={{ color: 'var(--gold)' }}>
                {gamesPlayed}
              </div>
              <div className="text-sm text-white/60 mt-1">{t('profile.gamesPlayed')}</div>
            </div>
            <div className="text-center p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.07)' }}>
              <div className="text-3xl font-title" style={{ color: 'var(--green-bingo)' }}>
                {gamesWon}
              </div>
              <div className="text-sm text-white/60 mt-1">{t('profile.gamesWon')}</div>
            </div>
          </div>
        </div>

        {/* Game history */}
        <div className="glass-card p-6 mb-6">
          <h2 className="font-bold text-white/90 mb-4">{t('profile.history')}</h2>
          {loading ? (
            <div className="text-center text-white/40">{t('common.loading')}</div>
          ) : history.length === 0 ? (
            <div className="text-center text-white/40">{t('profile.noGames')}</div>
          ) : (
            <div className="space-y-2">
              {history.map((entry) => (
                <div
                  key={entry.gamePlayer.id}
                  className="flex items-center justify-between p-3 rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.05)' }}
                >
                  <div>
                    <span
                      className="font-mono font-bold text-sm"
                      style={{ color: 'var(--gold)' }}
                    >
                      {entry.game.code}
                    </span>
                    <span className="text-white/40 text-xs ml-2">
                      {new Date(entry.gamePlayer.joined_at).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                  <span
                    className="text-xs font-bold px-2 py-1 rounded-full"
                    style={{
                      background:
                        entry.gamePlayer.bingo_verified === true
                          ? 'rgba(26,171,90,0.2)'
                          : entry.game.status === 'finished'
                          ? 'rgba(255,255,255,0.07)'
                          : 'rgba(255,204,0,0.15)',
                      color:
                        entry.gamePlayer.bingo_verified === true
                          ? '#1aab5a'
                          : entry.game.status === 'finished'
                          ? 'rgba(255,255,255,0.4)'
                          : 'var(--gold)',
                    }}
                  >
                    {entry.gamePlayer.bingo_verified === true
                      ? '🏆 Ganhou'
                      : entry.game.status === 'finished'
                      ? 'Finalizado'
                      : entry.game.status === 'running'
                      ? '🟢 Em andamento'
                      : '⏳ Aguardando'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ranking */}
        <div className="glass-card p-6">
          <h2 className="font-bold text-white/90 mb-4">{t('profile.ranking')}</h2>
          {ranking.length === 0 ? (
            <div className="text-center text-white/40">{t('common.loading')}</div>
          ) : (
            <div className="space-y-2">
              {ranking.map((entry, index) => (
                <div
                  key={entry.player_id}
                  className="flex items-center justify-between p-3 rounded-lg"
                  style={{
                    background:
                      entry.player_id === player.id
                        ? 'rgba(255,204,0,0.1)'
                        : 'rgba(255,255,255,0.05)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold"
                      style={{
                        background:
                          index === 0
                            ? 'var(--gold)'
                            : index === 1
                            ? '#C0C0C0'
                            : index === 2
                            ? '#CD7F32'
                            : 'rgba(255,255,255,0.1)',
                        color: index < 3 ? 'var(--dark)' : 'white',
                      }}
                    >
                      {index + 1}
                    </span>
                    <span className="font-semibold text-sm">{entry.nickname}</span>
                  </div>
                  <span className="text-sm font-bold" style={{ color: 'var(--gold)' }}>
                    {entry.wins} {t('profile.wins')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
