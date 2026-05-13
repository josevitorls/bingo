import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GamePlayer, Winner } from '../../types';

interface BingoNotificationProps {
  players: GamePlayer[];
  drawnNumbers: number[];
  gameCode: string;
  hostToken: string;
  onVerify: (gpId: string, isValid: boolean, winnerType?: Winner['type']) => Promise<void>;
  winners?: Winner[];
}

type WinnerType = Winner['type'];
const WIN_TYPE_OPTIONS: { value: WinnerType; label: string }[] = [
  { value: 'linha', label: 'Linha' },
  { value: 'coluna', label: 'Coluna' },
  { value: 'diagonal', label: 'Diagonal' },
  { value: 'cartela_cheia', label: 'Cartela Cheia' },
];

interface PendingVerify {
  gpId: string;
  selectedType: WinnerType;
  hasTie: boolean;
  tieNames: string[];
}

export const BingoNotification: React.FC<BingoNotificationProps> = ({
  players,
  onVerify,
  winners = [],
}) => {
  const { t } = useTranslation();
  const [pendingVerify, setPendingVerify] = useState<PendingVerify | null>(null);
  const [typeSelections, setTypeSelections] = useState<Record<string, WinnerType>>({});

  const claimedPlayers = players.filter((p) => p.bingo_claimed && p.bingo_verified === null);
  const verifiedPlayers = players.filter((p) => p.bingo_claimed && p.bingo_verified !== null);

  if (claimedPlayers.length === 0 && verifiedPlayers.length === 0) {
    return (
      <div className="text-center text-white/40 py-4 text-sm">
        {t('host.noBingos')}
      </div>
    );
  }

  const handleApproveClick = (gp: GamePlayer) => {
    const selectedType = typeSelections[gp.id] ?? 'linha';
    // Improvement 6: Tie detection — check if a winner of the same type already exists
    const existingForType = winners.filter((w) => w.type === selectedType);
    if (existingForType.length > 0) {
      const tieNames = existingForType.map((w) => w.nickname);
      const currentNickname = gp.players?.nickname ?? 'Anônimo';
      setPendingVerify({
        gpId: gp.id,
        selectedType,
        hasTie: true,
        tieNames: [...tieNames, currentNickname],
      });
    } else {
      onVerify(gp.id, true, selectedType);
    }
  };

  const handleDeclareTie = async (gpId: string, type: WinnerType) => {
    await onVerify(gpId, true, 'empate' as WinnerType);
    setPendingVerify(null);
  };

  const handleContinueDraw = async (gpId: string) => {
    // Reject this bingo — continue drawing
    await onVerify(gpId, false);
    setPendingVerify(null);
  };

  return (
    <div className="space-y-2">
      {/* Tie decision modal */}
      {pendingVerify?.hasTie && (
        <div
          className="p-3 rounded-lg border mb-2"
          style={{ background: 'rgba(249,115,22,0.1)', borderColor: '#f97316' }}
        >
          <div className="text-sm font-bold mb-2" style={{ color: '#f97316' }}>
            {t('host.tieDetected', { names: pendingVerify.tieNames.join(', ') })}
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              className="text-xs px-3 py-1.5 rounded-lg font-bold text-white"
              style={{ background: 'var(--green)' }}
              onClick={() => handleDeclareTie(pendingVerify.gpId, pendingVerify.selectedType)}
            >
              {t('host.declareTie')}
            </button>
            <button
              className="text-xs px-3 py-1.5 rounded-lg font-bold text-white/80"
              style={{ background: 'rgba(255,255,255,0.15)' }}
              onClick={() => handleContinueDraw(pendingVerify.gpId)}
            >
              {t('host.continueDraw')}
            </button>
            <button
              className="text-xs px-2 py-1.5 rounded-lg font-bold text-white/50"
              style={{ background: 'rgba(255,255,255,0.05)' }}
              onClick={() => setPendingVerify(null)}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Pending verifications */}
      {claimedPlayers.map((gp) => {
        const nickname = gp.players?.nickname ?? 'Anônimo';
        const selectedType = typeSelections[gp.id] ?? 'linha';
        return (
          <div
            key={gp.id}
            className="p-3 rounded-lg border"
            style={{
              background: 'rgba(255, 204, 0, 0.1)',
              borderColor: 'var(--gold)',
            }}
          >
            <div className="flex items-center justify-between mb-2">
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
                  onClick={() => handleApproveClick(gp)}
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
            {/* Improvement 5: Win type selector */}
            <div className="flex flex-wrap gap-1 mt-1">
              {WIN_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className="text-xs px-2 py-1 rounded-md font-medium transition-colors"
                  style={{
                    background: selectedType === opt.value ? 'rgba(255,204,0,0.25)' : 'rgba(255,255,255,0.07)',
                    color: selectedType === opt.value ? 'var(--gold)' : 'rgba(255,255,255,0.5)',
                    border: selectedType === opt.value ? '1px solid var(--gold)' : '1px solid transparent',
                  }}
                  onClick={() => setTypeSelections((prev) => ({ ...prev, [gp.id]: opt.value }))}
                >
                  {opt.label}
                </button>
              ))}
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
