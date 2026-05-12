import React from 'react';
import { useTranslation } from 'react-i18next';
import type { GamePlayer } from '../../types';

interface BingoNotificationProps {
  players: GamePlayer[];
  drawnNumbers: number[];
  gameCode: string;
  hostToken: string;
  onVerify: (gpId: string, isValid: boolean) => Promise<void>;
}

export const BingoNotification: React.FC<BingoNotificationProps> = ({
  players,
  onVerify,
}) => {
  const { t } = useTranslation();

  const claimedPlayers = players.filter((p) => p.bingo_claimed && p.bingo_verified === null);
  const verifiedPlayers = players.filter((p) => p.bingo_claimed && p.bingo_verified !== null);

  if (claimedPlayers.length === 0 && verifiedPlayers.length === 0) {
    return (
      <div className="text-center text-white/40 py-4 text-sm">
        {t('host.noBingos')}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Pending verifications */}
      {claimedPlayers.map((gp) => {
        const nickname = gp.players?.nickname ?? 'Anônimo';
        return (
          <div
            key={gp.id}
            className="flex items-center justify-between p-3 rounded-lg border"
            style={{
              background: 'rgba(255, 204, 0, 0.1)',
              borderColor: 'var(--gold)',
            }}
          >
            <div>
              <span className="font-bold text-sm" style={{ color: 'var(--gold)' }}>
                🎉 {nickname}
              </span>
              <div className="text-xs text-white/60">fez BINGO!</div>
            </div>
            <div className="flex gap-2">
              <button
                className="text-xs px-3 py-1.5 rounded-lg font-bold"
                style={{ background: 'var(--green)', color: 'white' }}
                onClick={() => onVerify(gp.id, true)}
              >
                {t('host.approve')}
              </button>
              <button
                className="text-xs px-3 py-1.5 rounded-lg font-bold"
                style={{ background: 'var(--red)', color: 'white' }}
                onClick={() => onVerify(gp.id, false)}
              >
                {t('host.reject')}
              </button>
            </div>
          </div>
        );
      })}

      {/* Already verified */}
      {verifiedPlayers.map((gp) => {
        const nickname = gp.players?.nickname ?? 'Anônimo';
        return (
          <div
            key={gp.id}
            className="flex items-center justify-between p-2 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.05)' }}
          >
            <span className="text-sm text-white/60">{nickname}</span>
            <span
              className="text-xs font-bold"
              style={{ color: gp.bingo_verified ? 'var(--green)' : 'var(--red)' }}
            >
              {gp.bingo_verified ? '✅ Aprovado' : '❌ Rejeitado'}
            </span>
          </div>
        );
      })}
    </div>
  );
};
