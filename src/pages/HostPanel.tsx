import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { broadcastToGame } from '../lib/realtime';
import { useGame } from '../hooks/useGame';
import { DrawPanel } from '../components/DrawPanel';
import { PlayerList } from '../components/PlayerList';
import { BingoNotification } from '../components/BingoNotification';
import { BingoCard } from '../components/BingoCard';
import { NumberBoard } from '../components/NumberBoard';
import type { BingoCardData, GamePlayer, Winner } from '../types';

// ── Isolated last-drawn display (same as PlayerGame) ─────────────────────────
const LastDrawnDisplay = React.memo(({ lastDrawn, t }: { lastDrawn: number | null; t: (k: string) => string }) => {
  if (!lastDrawn) return null;
  return (
    <div className="text-center py-3 mb-4 glass-card">
      <div className="text-xs text-white/50 mb-1">{t('game.lastDrawn')}</div>
      <div
        key={lastDrawn}
        className="font-title text-5xl sm:text-6xl animate-number-pop"
        style={{ color: 'var(--gold)' }}
      >
        {lastDrawn}
      </div>
    </div>
  );
});
LastDrawnDisplay.displayName = 'LastDrawnDisplay';

export const HostPanel: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { game, players, loading, refetch, setState_draw, setState_playerVerified } = useGame(code ?? null);

  const hostToken = code ? localStorage.getItem(`bingo_host_token_${code}`) : null;
  const storedPlayer = localStorage.getItem('bingo_player');
  const currentPlayer = storedPlayer ? JSON.parse(storedPlayer) : null;

  const [copied, setCopied] = useState(false);

  // Improvement 1: Inline end-game confirmation
  const [endConfirming, setEndConfirming] = useState(false);
  const [gameEnded, setGameEnded] = useState(false);

  // Improvement 5: Winners tracking
  const [winners, setWinners] = useState<Winner[]>([]);

  // Host's own card state (when host also plays)
  const [hostCard, setHostCard] = useState<BingoCardData | null>(null);
  const hostCardRef = useRef<BingoCardData | null>(null);
  const hostGpIdRef = useRef<string | null>(null);
  const drawnRef = useRef<number[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync host card from players list once loaded
  useEffect(() => {
    if (!currentPlayer || hostCard) return;
    const gp = players.find((p) => p.player_id === currentPlayer.id);
    if (gp) {
      setHostCard(gp.card);
      hostCardRef.current = gp.card;
      hostGpIdRef.current = gp.id;
    }
  }, [players, currentPlayer, hostCard]);

  // Keep drawnRef in sync
  useEffect(() => {
    if (game) drawnRef.current = game.drawn_numbers;
  }, [game?.drawn_numbers]);

  // Improvement 3: Auto-mark for host's card on draw events
  useEffect(() => {
    if (!code || !game) return;
    // We detect auto_mark via game.mode
    if (!game.mode.includes('auto_mark')) return;

    // Subscribe to draw events to auto-mark host card
    // The draw event is already handled by useGame's realtime,
    // but we need to react to drawnNumbers changes for auto-mark
  }, [code, game]);

  // Auto-mark host card when drawnNumbers changes (Improvement 3)
  useEffect(() => {
    if (!game?.mode.includes('auto_mark')) return;
    const current = hostCardRef.current;
    if (!current) return;
    const drawn = game.drawn_numbers;
    if (drawn.length === 0) return;

    const newMarked = current.numbers.map((row, ri) =>
      row.map((num, ci) => {
        if (ri === 2 && ci === 2) return true; // FREE
        if (current.marked[ri][ci]) return true; // already marked
        return drawn.includes(num);
      })
    );
    const changed = newMarked.some((row, ri) => row.some((val, ci) => val !== current.marked[ri][ci]));
    if (!changed) return;

    const newCard = { ...current, marked: newMarked };
    setHostCard(newCard);
    hostCardRef.current = newCard;
    // Persist immediately (no debounce for auto-mark)
    if (hostGpIdRef.current) {
      supabase.from('game_players').update({ card: newCard }).eq('id', hostGpIdRef.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.drawn_numbers, game?.mode]);

  const persistHostCard = useCallback(async (card: BingoCardData) => {
    if (!hostGpIdRef.current) return;
    await supabase.from('game_players').update({ card }).eq('id', hostGpIdRef.current);
  }, []);

  // Improvement 4: Traditional mode = no auto_mark AND no cartela_cheia
  const isTraditionalMode = game
    ? !game.mode.includes('auto_mark') && !game.mode.includes('cartela_cheia')
    : true;

  const handleHostCellClick = useCallback((row: number, col: number, number: number) => {
    const current = hostCardRef.current;
    if (!current) return;
    if (row === 2 && col === 2) return;
    // Improvement 4: only warn if NOT traditional mode
    if (!isTraditionalMode && number !== 0 && !drawnRef.current.includes(number)) {
      toast(`⚠️ Número ${number} ainda não foi sorteado`);
    }
    const newMarked = current.marked.map((r, ri) =>
      r.map((val, ci) => (ri === row && ci === col ? !val : val))
    );
    const newCard = { ...current, marked: newMarked };
    setHostCard(newCard);
    hostCardRef.current = newCard;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => persistHostCard(newCard), 500);
  }, [persistHostCard, isTraditionalMode]);

  // Verify host access
  useEffect(() => {
    if (!loading && game && !hostToken) {
      toast.error('Acesso negado: token de host não encontrado');
      navigate('/');
    }
  }, [loading, game, hostToken, navigate]);

  const handleCopyCode = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareLink = () => {
    const url = `${window.location.origin}/join?code=${code}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copiado!');
  };

  const handleStartGame = async () => {
    if (!game || !hostToken) return;
    try {
      await supabase.rpc('update_game_status', {
        game_code: game.code,
        host_token_input: hostToken,
        new_status: 'running',
      });
      await broadcastToGame(game.code, 'status', { status: 'running' });
      toast.success(t('host.gameStarted'));
      refetch();
    } catch (err) {
      toast.error('Erro ao iniciar o jogo');
    }
  };

  // Improvement 1: Inline end game (no confirm())
  const handleEndGame = async () => {
    if (!game || !hostToken) return;
    try {
      await supabase.rpc('update_game_status', {
        game_code: game.code,
        host_token_input: hostToken,
        new_status: 'finished',
      });
      await broadcastToGame(game.code, 'status', { status: 'finished' });
      toast.success(t('host.gameEnded'));
      setEndConfirming(false);
      setGameEnded(true);
      refetch();
    } catch (err) {
      toast.error('Erro ao encerrar o jogo');
    }
  };

  const handleDraw = useCallback(async () => {
    if (!game || !hostToken) return;
    const { data, error } = await supabase.rpc('draw_number', {
      game_code: game.code,
      host_token_input: hostToken,
    });
    if (error) {
      toast.error('Erro ao sortear: ' + error.message);
      return;
    }
    const newDrawnNumbers = [...game.drawn_numbers, data as number];
    setState_draw(newDrawnNumbers);
    await broadcastToGame(game.code, 'draw', {
      number: data,
      drawnNumbers: newDrawnNumbers,
    });
  }, [game, hostToken, setState_draw]);

  // Improvement 5: handleVerifyBingo with winner tracking
  const handleVerifyBingo = async (gpId: string, isValid: boolean, winnerType?: Winner['type']) => {
    if (!game || !hostToken) return;
    try {
      await supabase.rpc('verify_bingo', {
        game_code: game.code,
        host_token_input: hostToken,
        gp_id: gpId,
        is_valid: isValid,
      });
      await broadcastToGame(game.code, 'verify', {
        gamePlerId: gpId,
        verified: isValid,
      });
      toast.success(isValid ? 'Bingo aprovado!' : 'Bingo rejeitado');
      setState_playerVerified(gpId, isValid);

      // Track winners
      if (isValid && winnerType) {
        const gp = players.find((p) => p.id === gpId);
        const nickname = gp?.players?.nickname ?? 'Anônimo';
        const newWinner: Winner = { playerId: gpId, nickname, type: winnerType };
        const updatedWinners = [...winners, newWinner];
        setWinners(updatedWinners);
        await broadcastToGame(game.code, 'winner', { winners: updatedWinners });

        // Auto-end only if cartela_cheia
        if (winnerType === 'cartela_cheia') {
          handleEndGame();
        }
      }
    } catch (err) {
      toast.error('Erro ao verificar bingo');
    }
  };

  // Improvement 6: Tie detection helper
  const checkForTie = (gpId: string, winnerType: Winner['type']): Winner[] => {
    return winners.filter((w) => w.type === winnerType);
  };

  // Find host's own game_player entry
  const myGamePlayer: GamePlayer | undefined = currentPlayer
    ? players.find((p) => p.player_id === currentPlayer.id)
    : undefined;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white/60 text-lg">{t('common.loading')}</div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white/60 text-lg">Jogo não encontrado</div>
      </div>
    );
  }

  const lastDrawn =
    game.drawn_numbers.length > 0
      ? game.drawn_numbers[game.drawn_numbers.length - 1]
      : null;

  const statusColors: Record<string, string> = {
    waiting: '#FFCC00',
    running: '#1aab5a',
    finished: '#e02020',
  };

  // Improvement 5: Winner type label helper
  const winnerTypeLabel = (type: Winner['type']) => {
    const labels: Record<Winner['type'], string> = {
      linha: t('host.winnerType_linha'),
      coluna: t('host.winnerType_coluna'),
      diagonal: t('host.winnerType_diagonal'),
      cartela_cheia: t('host.winnerType_cartela_cheia'),
      empate: t('host.winnerType_empate'),
    };
    return labels[type] ?? type;
  };

  return (
    <div className="min-h-screen px-4 py-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <button
              className="text-white/60 hover:text-white text-2xl"
              onClick={() => navigate('/')}
            >
              ←
            </button>
            <h1 className="font-title text-2xl sm:text-3xl" style={{ color: 'var(--gold)' }}>
              {t('host.title')}
            </h1>
          </div>

          {/* Status badge */}
          <div
            className="px-3 py-1 rounded-full text-sm font-bold"
            style={{
              background: statusColors[game.status] + '22',
              color: statusColors[game.status],
              border: `1px solid ${statusColors[game.status]}`,
            }}
          >
            {t(`host.status.${game.status}`)}
          </div>
        </div>

        {/* Game code */}
        <div className="glass-card p-4 sm:p-6 mb-4 text-center">
          <div className="text-sm text-white/60 mb-1">{t('host.gameCode')}</div>
          <div
            className="font-title text-6xl sm:text-7xl mb-4 tracking-widest"
            style={{ color: 'var(--gold)' }}
          >
            {game.code}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <button className="btn-secondary text-sm" onClick={handleCopyCode}>
              {copied ? t('common.copied') : t('host.copyCode')}
            </button>
            <button className="btn-secondary text-sm" onClick={handleShareLink}>
              {t('host.shareInvite')}
            </button>
          </div>
        </div>

        {/* Game controls — Improvement 1: Inline confirmation */}
        <div className="flex gap-3 mb-6 items-center flex-wrap">
          {game.status === 'waiting' && (
            <button
              className="btn-primary flex-1 py-3"
              onClick={handleStartGame}
              disabled={players.length === 0}
            >
              {t('host.startGame')}
            </button>
          )}

          {game.status === 'running' && !gameEnded && !endConfirming && (
            <button
              className="flex-1 py-3 rounded-2xl font-bold text-white transition-colors"
              style={{ background: '#f97316' }}
              onClick={() => setEndConfirming(true)}
            >
              {t('host.endGame')}
            </button>
          )}

          {game.status === 'running' && !gameEnded && endConfirming && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-white/80 font-semibold text-sm">{t('host.endGameConfirm')}</span>
              <button
                className="px-4 py-2 rounded-xl font-bold text-white text-sm"
                style={{ background: 'var(--red)' }}
                onClick={handleEndGame}
              >
                {t('host.endGameYes')}
              </button>
              <button
                className="px-4 py-2 rounded-xl font-bold text-white/80 text-sm"
                style={{ background: 'rgba(255,255,255,0.15)' }}
                onClick={() => setEndConfirming(false)}
              >
                {t('host.endGameNo')}
              </button>
            </div>
          )}

          {/* Improvement 5: Continue/End after partial win */}
          {game.status === 'running' && !gameEnded && winners.length > 0 && !endConfirming && (
            <button
              className="btn-secondary py-3 px-4"
              onClick={() => {/* already drawing, just UI indicator */}}
              style={{ opacity: 0.7, cursor: 'default' }}
            >
              {t('host.continueGame')}
            </button>
          )}

          {(game.status === 'finished' || gameEnded) && (
            <button
              className="btn-primary flex-1 py-3"
              onClick={() => navigate('/create')}
            >
              {t('host.newGame')}
            </button>
          )}
        </div>

        {/* Improvement 5: Winners banner */}
        {winners.length > 0 && (
          <div className="glass-card p-4 mb-4">
            <h2 className="text-white/70 text-sm font-semibold mb-2 uppercase tracking-wide">
              🏆 {t('host.winners')}
            </h2>
            <div className="flex flex-wrap gap-2">
              {winners.map((w, i) => (
                <div
                  key={i}
                  className="px-3 py-1.5 rounded-lg text-sm font-bold"
                  style={{ background: 'rgba(255,204,0,0.15)', color: 'var(--gold)' }}
                >
                  {w.nickname} — {winnerTypeLabel(w.type)}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          {/* Left column */}
          <div className="space-y-4">
            {/* Improvement 2: Sorteio section with LastDrawnDisplay + NumberBoard */}
            <div>
              <h2 className="text-white/70 text-sm font-semibold mb-2 uppercase tracking-wide">
                Sorteio
              </h2>

              {/* Last drawn — big & animated */}
              <LastDrawnDisplay lastDrawn={lastDrawn} t={t} />

              {/* Draw action panel */}
              <DrawPanel
                lastDrawn={lastDrawn}
                drawnNumbers={game.drawn_numbers}
                onDraw={handleDraw}
                autoInterval={game.auto_draw_interval}
                gameRunning={game.status === 'running'}
              />

              {/* NumberBoard — same as players */}
              {game.drawn_numbers.length > 0 && (
                <div className="glass-card p-4 mt-3">
                  <div className="text-xs text-white/50 mb-2 uppercase tracking-wide">
                    {t('game.drawnNumbers')} ({game.drawn_numbers.length})
                  </div>
                  <NumberBoard
                    drawnNumbers={game.drawn_numbers}
                    rangeMin={game.number_range_min}
                    rangeMax={game.number_range_max}
                    lastDrawn={lastDrawn}
                  />
                </div>
              )}
            </div>

            {/* Bingo notifications */}
            <div className="glass-card p-4">
              <h2 className="text-white/70 text-sm font-semibold mb-3 uppercase tracking-wide">
                {t('host.bingoNotifications')}
              </h2>
              <BingoNotification
                players={players}
                drawnNumbers={game.drawn_numbers}
                gameCode={game.code}
                hostToken={hostToken ?? ''}
                onVerify={handleVerifyBingo}
                winners={winners}
              />
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {/* Players */}
            <div className="glass-card p-4">
              <h2 className="text-white/70 text-sm font-semibold mb-3 uppercase tracking-wide">
                {t('host.players')} ({players.length})
              </h2>
              <PlayerList
                players={players}
                hostPlayerId={game.host_player_id}
                currentPlayerId={currentPlayer?.id}
              />
            </div>

            {/* Host's own card — fully interactive when game is running */}
            {myGamePlayer && hostCard && (
              <div className="glass-card p-4">
                <h2 className="text-white/70 text-sm font-semibold mb-3 uppercase tracking-wide">
                  {t('host.myCard')}
                </h2>
                <BingoCard
                  card={hostCard}
                  onCellClick={handleHostCellClick}
                  size="sm"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
