import React from 'react';
import { useTranslation } from 'react-i18next';
import type { GamePlayer } from '../../types';

interface PlayerListProps {
  players: GamePlayer[];
  hostPlayerId?: string | null;
  currentPlayerId?: string | null;
}

export const PlayerList: React.FC<PlayerListProps> = ({
  players,
  hostPlayerId,
  currentPlayerId,
}) => {
  const { t } = useTranslation();

  if (players.length === 0) {
    return (
      <div className="text-center text-white/40 py-4 text-sm">
        {t('host.noPlayers')}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {players.map((gp) => {
        const nickname = gp.players?.nickname ?? 'Anônimo';
        const isHost = gp.player_id === hostPlayerId;
        const isMe = gp.player_id === currentPlayerId;

        return (
          <div
            key={gp.id}
            className="flex items-center justify-between px-3 py-2 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.07)' }}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                style={{ background: 'var(--gold)', color: 'var(--dark)' }}
              >
                {nickname.charAt(0).toUpperCase()}
              </div>
              <div>
                <span className="font-semibold text-sm">{nickname}</span>
                {isHost && (
                  <span className="ml-2 text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--gold)', color: 'var(--dark)' }}>
                    Host
                  </span>
                )}
                {isMe && !isHost && (
                  <span className="ml-2 text-xs text-white/50">(você)</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {gp.bingo_claimed && (
                <span
                  className="text-xs px-2 py-0.5 rounded font-bold"
                  style={{
                    background: gp.bingo_verified === true
                      ? 'var(--green)'
                      : gp.bingo_verified === false
                      ? 'var(--red)'
                      : 'var(--gold)',
                    color: 'white',
                  }}
                >
                  {gp.bingo_verified === true
                    ? '✅ BINGO'
                    : gp.bingo_verified === false
                    ? '❌ Inválido'
                    : '⏳ BINGO'}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
