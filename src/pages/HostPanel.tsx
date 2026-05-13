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
import type { BingoCardData, GamePlayer } from '../types';

export const HostPanel: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { game, players, loading, refetch, setState_draw, setState_playerVerified } = useGame(code ?? null);

  const hostToken = code ? localStorage.getItem(`bingo_host_token_${code}`) : null;
  const storedPlayer = localStorage.getItem('bingo_player');
  const currentPlayer = storedPlayer ? JSON.parse(storedPlayer) : null;

  const [copied, setCopied] = useState(false);

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

  const persistHostCard = useCallback(async (card: BingoCardData) => {
    if (!hostGpIdRef.current) return;
    await supabase.from('game_players').update({ card }).eq('id', hostGpIdRef.current);
  }, []);

  const handleHostCellClick = useCallback((row: number, col: number, number: number) => {
    const current = hostCardRef.current;
    if (!current) return;
    if (row === 2 && col === 2) return;
    if (number !== 0 && !drawnRef.current.includes(number)) {
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
  }, [persistHostCard]);

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
      refetch(); // needed to update status locally since game obj came from useGame
    } catch (err) {
      toast.error('Erro ao iniciar o jogo');
    }
  };

  const handleEndGame = async () => {
    if (!game || !hostToken) return;
    if (!confirm(t('common.confirm') + '?')) return;
    try {
      await supabase.rpc('update_game_status', {
        game_code: game.code,
        host_token_input: hostToken,
        new_status: 'finished',
      });
      await broadcastToGame(game.code, 'status', { status: 'finished' });
      toast.success(t('host.gameEnded'));
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
    // Update local state immediately — no refetch needed
    setState_draw(newDrawnNumbers);
    await broadcastToGame(game.code, 'draw', {
      number: data,
      drawnNumbers: newDrawnNumbers,
    });
  }, [game, hostToken, setState_draw]);

  const handleVerifyBingo = async (gpId: string, isValid: boolean) => {
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
    } catch (err) {
      toast.error('Erro ao verificar bingo');
    }
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

        {/* Game controls */}
        <div className="flex gap-3 mb-6">
          {game.status === 'waiting' && (
            <button
              className="btn-primary flex-1 py-3"
              onClick={handleStartGame}
              disabled={players.length === 0}
            >
              {t('host.startGame')}
            </button>
          )}
          {game.status === 'running' && (
            <button
              className="btn-danger flex-1 py-3"
              onClick={handleEndGame}
            >
              {t('host.endGame')}
            </button>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Left column */}
          <div className="space-y-4">
            {/* Draw panel */}
            <div>
              <h2 className="text-white/70 text-sm font-semibold mb-2 uppercase tracking-wide">
                Sorteio
              </h2>
              <DrawPanel
                lastDrawn={lastDrawn}
                drawnNumbers={game.drawn_numbers}
                onDraw={handleDraw}
                autoInterval={game.auto_draw_interval}
                gameRunning={game.status === 'running'}
              />
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
