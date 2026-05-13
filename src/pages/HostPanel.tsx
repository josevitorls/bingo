import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { broadcastToGame, subscribeToGame } from '../lib/realtime';
import { useGame } from '../hooks/useGame';
import { generateUniqueCode } from '../lib/gameCode';
import { checkBingo } from '../lib/bingoChecker';
import { DrawPanel } from '../components/DrawPanel';
import { PlayerList } from '../components/PlayerList';
import { BingoNotification } from '../components/BingoNotification';
import { BingoCard } from '../components/BingoCard';
import { NumberBoard } from '../components/NumberBoard';
import type { BingoCardData, GamePlayer, Winner, TieResponsePayload } from '../types';

const PRIZE_TYPES = ['linha', 'coluna', 'diagonal', 'cartela_cheia'] as const;
type PrizeType = typeof PRIZE_TYPES[number];

// ── Isolated last-drawn display ───────────────────────────────────────────────
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
  const { game, players, loading, refetch, setState_draw, setState_playerVerified, setState_resetClaim } = useGame(code ?? null);

  const hostToken = code ? localStorage.getItem(`bingo_host_token_${code}`) : null;
  const storedPlayer = localStorage.getItem('bingo_player');
  const currentPlayer = storedPlayer ? JSON.parse(storedPlayer) : null;

  const [copied, setCopied] = useState(false);
  const [endConfirming, setEndConfirming] = useState(false);
  const [gameEnded, setGameEnded] = useState(false);
  const [invitingNewGame, setInvitingNewGame] = useState(false);

  // Winners tracking
  const [winners, setWinners] = useState<Winner[]>([]);

  // Tie-breaking vote state
  const [tieVote, setTieVote] = useState<{
    tiedPlayers: { id: string; nickname: string }[];
    winType: string;
    responses: Record<string, 'accept' | 'reject'>;
    startedAt: number;
  } | null>(null);
  const [tieCountdown, setTieCountdown] = useState(60);
  const tieResolvedRef = useRef(false);

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

  // Auto-mark host card when drawnNumbers changes
  useEffect(() => {
    if (!game?.mode.includes('auto_mark')) return;
    const current = hostCardRef.current;
    if (!current) return;
    const drawn = game.drawn_numbers;
    if (drawn.length === 0) return;

    const newMarked = current.numbers.map((row, ri) =>
      row.map((num, ci) => {
        if (ri === 2 && ci === 2) return true;
        if (current.marked[ri][ci]) return true;
        return drawn.includes(num);
      })
    );
    const changed = newMarked.some((row, ri) => row.some((val, ci) => val !== current.marked[ri][ci]));
    if (!changed) return;

    const newCard = { ...current, marked: newMarked };
    setHostCard(newCard);
    hostCardRef.current = newCard;
    if (hostGpIdRef.current) {
      supabase.from('game_players').update({ card: newCard }).eq('id', hostGpIdRef.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.drawn_numbers, game?.mode]);

  const persistHostCard = useCallback(async (card: BingoCardData) => {
    if (!hostGpIdRef.current) return;
    await supabase.from('game_players').update({ card }).eq('id', hostGpIdRef.current);
  }, []);

  const isTraditionalMode = game
    ? !game.mode.includes('auto_mark') && !game.mode.includes('cartela_cheia')
    : true;

  const handleHostCellClick = useCallback((row: number, col: number, number: number) => {
    const current = hostCardRef.current;
    if (!current) return;
    if (row === 2 && col === 2) return;
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
    } catch {
      toast.error('Erro ao iniciar o jogo');
    }
  };

  const handleEndGame = useCallback(async () => {
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
    } catch {
      toast.error('Erro ao encerrar o jogo');
    }
  }, [game, hostToken, refetch, t]);

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

  // Feature 3: verify bingo with winType + canClaimAgain for multi-prize
  const handleVerifyBingo = async (gpId: string, isValid: boolean, winnerType?: Winner['type']) => {
    if (!game || !hostToken) return;
    try {
      await supabase.rpc('verify_bingo', {
        game_code: game.code,
        host_token_input: hostToken,
        gp_id: gpId,
        is_valid: isValid,
      });

      const gamePrizeTypes = game.mode.filter((m): m is PrizeType => PRIZE_TYPES.includes(m as PrizeType));
      const isMultiPrize = gamePrizeTypes.length > 1;

      let canClaimAgain = false;
      let updatedWinners = winners;

      if (isValid && winnerType) {
        const gp = players.find((p) => p.id === gpId);
        const nickname = gp?.players?.nickname ?? 'Anônimo';
        const newWinner: Winner = { playerId: gpId, nickname, type: winnerType };
        updatedWinners = [...winners, newWinner];
        setWinners(updatedWinners);
        await broadcastToGame(game.code, 'winner', { winners: updatedWinners });

        if (isMultiPrize) {
          const gpWonTypes = updatedWinners.filter((w) => w.playerId === gpId).map((w) => w.type);
          canClaimAgain = gamePrizeTypes.some((t) => !gpWonTypes.includes(t as Winner['type']));
        }

        if (winnerType === 'cartela_cheia') {
          handleEndGame();
        }
      }

      await broadcastToGame(game.code, 'verify', {
        gamePlerId: gpId,
        verified: isValid,
        winType: winnerType,
        canClaimAgain,
      });

      if (canClaimAgain) {
        // Reset DB claim so player can claim again for the next type
        await supabase
          .from('game_players')
          .update({ bingo_claimed: false, bingo_verified: null })
          .eq('id', gpId);
        setState_resetClaim(gpId);
        toast.success('Bingo aprovado! Jogador pode reivindicar novamente.');
      } else {
        setState_playerVerified(gpId, isValid);
        toast.success(isValid ? 'Bingo aprovado!' : 'Bingo rejeitado');
      }
    } catch {
      toast.error('Erro ao verificar bingo');
    }
  };

  // Tie-breaking: resolve with collected responses
  const resolveTieWithResponses = useCallback(async (
    tiedPlayers: { id: string; nickname: string }[],
    winType: string,
    responses: Record<string, 'accept' | 'reject'>
  ) => {
    if (!game) return;
    const acceptedPlayers = tiedPlayers.filter((p) => responses[p.id] === 'accept');
    if (acceptedPlayers.length > 0) {
      const newWinners: Winner[] = acceptedPlayers.map((p) => ({
        playerId: p.id,
        nickname: p.nickname,
        type: winType as Winner['type'],
      }));
      const updatedWinners = [...winners, ...newWinners];
      setWinners(updatedWinners);
      await broadcastToGame(game.code, 'winner', { winners: updatedWinners });
      const names = acceptedPlayers.map((p) => p.nickname).join(', ');
      toast.success(`Empate resolvido: ${names}`);
    } else {
      toast(`Nenhum jogador aceitou o empate — selecione o vencedor manualmente`, { duration: 6000, icon: '⚖️' });
    }
    setTieVote(null);
    tieResolvedRef.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, winners]);

  // Tie-breaking: start a vote
  const handleStartTieVote = useCallback(async (
    tiedPlayers: { id: string; nickname: string }[],
    winType: string
  ) => {
    if (!game) return;
    tieResolvedRef.current = false;
    const startedAt = Date.now();
    setTieVote({ tiedPlayers, winType, responses: {}, startedAt });
    setTieCountdown(60);
    await broadcastToGame(game.code, 'tie_vote', {
      tiedPlayers,
      winType,
      startedAt,
      timeoutSeconds: 60,
    });
    setTimeout(() => {
      if (!tieResolvedRef.current) {
        setTieVote((prev) => {
          if (!prev) return prev;
          resolveTieWithResponses(prev.tiedPlayers, prev.winType, prev.responses);
          return prev;
        });
      }
    }, 60000);
  }, [game, resolveTieWithResponses]);

  // Countdown for tie vote
  useEffect(() => {
    if (!tieVote) return;
    setTieCountdown(60);
    const interval = setInterval(() => {
      setTieCountdown((prev) => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [tieVote?.startedAt]);

  // Listen for tie_response events
  useEffect(() => {
    if (!code) return;
    const unsubscribe = subscribeToGame(code, (msg) => {
      if (msg.type === 'tie_response') {
        const payload = msg.payload as TieResponsePayload;
        setTieVote((prev) => {
          if (!prev) return prev;
          const newResponses = { ...prev.responses, [payload.playerId]: payload.decision };
          if (prev.tiedPlayers.every((p) => newResponses[p.id])) {
            setTimeout(() => resolveTieWithResponses(prev.tiedPlayers, prev.winType, newResponses), 0);
          }
          return { ...prev, responses: newResponses };
        });
      }
    });
    return unsubscribe;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Feature 4: Invite same players to a new game
  const handleInviteToNewGame = useCallback(async () => {
    if (!game || !currentPlayer) return;
    setInvitingNewGame(true);
    try {
      const newCode = await generateUniqueCode();
      const newHostToken = crypto.randomUUID();
      localStorage.setItem(`bingo_host_token_${newCode}`, newHostToken);

      const { error } = await supabase.from('games').insert({
        code: newCode,
        host_token: newHostToken,
        host_player_id: currentPlayer.id,
        status: 'waiting',
        mode: game.mode,
        number_range_min: game.number_range_min,
        number_range_max: game.number_range_max,
        auto_draw_interval: game.auto_draw_interval,
      });
      if (error) throw error;

      // Broadcast invite to all current players
      await broadcastToGame(game.code, 'game_invite', { newGameCode: newCode });

      toast.success('Convite enviado! Redirecionando para o novo jogo...');
      setTimeout(() => navigate(`/host/${newCode}`), 1500);
    } catch {
      toast.error('Erro ao criar novo jogo');
      setInvitingNewGame(false);
    }
  }, [game, currentPlayer, navigate]);

  // Feature 1: Host BINGO button
  const myGamePlayer: GamePlayer | undefined = currentPlayer
    ? players.find((p) => p.player_id === currentPlayer.id)
    : undefined;

  const handleHostClaimBingo = useCallback(async () => {
    if (!game || !myGamePlayer || !hostCardRef.current) return;
    const check = checkBingo(hostCardRef.current);
    if (!check.hasPartialBingo && !check.hasFullBingo) {
      toast.error('Você não tem bingo ainda!');
      return;
    }
    try {
      await supabase
        .from('game_players')
        .update({ bingo_claimed: true, bingo_claimed_at: new Date().toISOString() })
        .eq('id', myGamePlayer.id);
      await broadcastToGame(game.code, 'bingo', {
        playerId: currentPlayer.id,
        nickname: currentPlayer?.nickname,
      });
      toast.success('🎉 BINGO enviado! Aguardando verificação...');
    } catch {
      toast.error('Erro ao reivindicar bingo');
    }
  }, [game, myGamePlayer, currentPlayer]);

  // Determine if host can still claim (multi-prize)
  const gamePrizeTypes = game?.mode.filter((m): m is PrizeType => PRIZE_TYPES.includes(m as PrizeType)) ?? [];
  const hostWonTypes = winners.filter((w) => w.playerId === myGamePlayer?.id).map((w) => w.type);
  const hostCanClaim = myGamePlayer && hostCard &&
    game?.status === 'running' &&
    !myGamePlayer.bingo_claimed &&
    gamePrizeTypes.some((t) => !hostWonTypes.includes(t as Winner['type']));

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

  const winnerTypeLabel = (type: Winner['type']) => {
    const labels: Record<string, string> = {
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

          {game.status === 'running' && !gameEnded && winners.length > 0 && !endConfirming && (
            <button
              className="btn-secondary py-3 px-4"
              style={{ opacity: 0.7, cursor: 'default' }}
            >
              {t('host.continueGame')}
            </button>
          )}

          {/* Feature 4: Post-game actions */}
          {(game.status === 'finished' || gameEnded) && (
            <div className="flex gap-2 flex-wrap flex-1">
              <button
                className="btn-primary flex-1 py-3"
                onClick={() => navigate('/create')}
              >
                {t('host.newGame')}
              </button>
              <button
                className="flex-1 py-3 rounded-2xl font-bold text-sm"
                style={{
                  background: invitingNewGame ? 'rgba(255,255,255,0.1)' : 'rgba(255,204,0,0.15)',
                  color: 'var(--gold)',
                  border: '1px solid var(--gold)',
                }}
                onClick={handleInviteToNewGame}
                disabled={invitingNewGame}
              >
                {invitingNewGame ? 'Criando...' : '📨 Convidar mesmas pessoas'}
              </button>
            </div>
          )}
        </div>

        {/* Winners banner */}
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
            <div>
              <h2 className="text-white/70 text-sm font-semibold mb-2 uppercase tracking-wide">
                Sorteio
              </h2>
              <LastDrawnDisplay lastDrawn={lastDrawn} t={t} />
              <DrawPanel
                lastDrawn={lastDrawn}
                drawnNumbers={game.drawn_numbers}
                onDraw={handleDraw}
                autoInterval={game.auto_draw_interval}
                gameRunning={game.status === 'running'}
              />
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

            {/* Tie vote panel */}
            {tieVote && (
              <div className="glass-card p-4 mb-0" style={{ border: '2px solid #f97316' }}>
                <h2 className="text-sm font-bold mb-2" style={{ color: '#f97316' }}>
                  ⚖️ Votação de Empate
                </h2>
                <div className="text-xs text-white/60 mb-2">
                  Tipo: <span className="font-bold text-white/80">{tieVote.winType}</span>
                </div>
                <div className="space-y-1 mb-3">
                  {tieVote.tiedPlayers.map((p) => {
                    const response = tieVote.responses[p.id];
                    return (
                      <div key={p.id} className="flex items-center justify-between text-sm">
                        <span className="text-white/80">{p.nickname}</span>
                        <span
                          className="text-xs font-bold px-2 py-0.5 rounded"
                          style={{
                            background: response === 'accept'
                              ? 'rgba(26,171,90,0.2)'
                              : response === 'reject'
                              ? 'rgba(224,32,32,0.2)'
                              : 'rgba(255,255,255,0.1)',
                            color: response === 'accept'
                              ? 'var(--green)'
                              : response === 'reject'
                              ? 'var(--red)'
                              : 'rgba(255,255,255,0.5)',
                          }}
                        >
                          {response === 'accept' ? '✓ Aceitar' : response === 'reject' ? '✕ Recusar' : '⏳'}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2 text-xs text-white/60">
                  <span>⏱️</span>
                  <div className="flex-1 rounded-full h-2" style={{ background: 'rgba(255,255,255,0.1)' }}>
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{
                        width: `${(tieCountdown / 60) * 100}%`,
                        background: tieCountdown > 20 ? '#f97316' : 'var(--red)',
                      }}
                    />
                  </div>
                  <span className="font-bold" style={{ color: '#f97316' }}>{tieCountdown}s</span>
                </div>
              </div>
            )}

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
                onStartTieVote={handleStartTieVote}
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

            {/* Host's own card — Feature 1: with BINGO button */}
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

                {/* Feature 1: BINGO button for host-as-player */}
                <div className="mt-3">
                  {/* Show won types */}
                  {hostWonTypes.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {hostWonTypes.map((ht) => (
                        <span
                          key={ht}
                          className="text-xs px-2 py-1 rounded-lg font-semibold"
                          style={{ background: 'rgba(26,171,90,0.2)', color: 'var(--green)' }}
                        >
                          ✅ {winnerTypeLabel(ht as Winner['type'])}
                        </span>
                      ))}
                    </div>
                  )}

                  {myGamePlayer.bingo_claimed && myGamePlayer.bingo_verified === null && (
                    <div
                      className="w-full py-2 rounded-xl text-center text-sm font-bold"
                      style={{ background: 'rgba(255,204,0,0.2)', color: 'var(--gold)' }}
                    >
                      {t('game.bingoSent')}
                    </div>
                  )}

                  {myGamePlayer.bingo_claimed && myGamePlayer.bingo_verified === true && !hostCanClaim && (
                    <div
                      className="w-full py-2 rounded-xl text-center text-sm font-bold"
                      style={{ background: 'rgba(26,171,90,0.2)', color: 'var(--green)' }}
                    >
                      {t('game.bingoVerified')}
                    </div>
                  )}

                  {hostCanClaim && (
                    <button
                      className="btn-primary w-full py-2 text-lg rounded-xl"
                      onClick={handleHostClaimBingo}
                    >
                      {t('game.claimBingo')}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
