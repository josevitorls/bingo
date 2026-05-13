import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { subscribeToGame, broadcastToGame } from '../lib/realtime';
import { checkBingo } from '../lib/bingoChecker';
import { BingoCard } from '../components/BingoCard';
import { NumberBoard } from '../components/NumberBoard';
import type { BingoCardData, Game, GamePlayer, Winner, TieVotePayload } from '../types';

const DEBOUNCE_MS = 500;

// Isolated panel — only re-renders when drawnNumbers changes
const DrawnNumbersPanel = React.memo(({
  drawnNumbers,
  rangeMin,
  rangeMax,
  lastDrawn,
  t,
}: {
  drawnNumbers: number[];
  rangeMin: number;
  rangeMax: number;
  lastDrawn: number | null;
  t: (key: string) => string;
}) => (
  <div className="glass-card p-4">
    <h2 className="text-white/70 text-sm font-semibold mb-3 uppercase tracking-wide">
      {t('game.drawnNumbers')} ({drawnNumbers.length})
    </h2>
    {drawnNumbers.length === 0 ? (
      <div className="text-center text-white/40 py-4 text-sm">{t('game.noNumbers')}</div>
    ) : (
      <NumberBoard
        drawnNumbers={drawnNumbers}
        rangeMin={rangeMin}
        rangeMax={rangeMax}
        lastDrawn={lastDrawn}
      />
    )}
    {drawnNumbers.length > 0 && (
      <div className="mt-4">
        <div className="text-xs text-white/40 mb-2">Ordem dos sorteios</div>
        <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
          {[...drawnNumbers].reverse().map((n, i) => (
            <span
              key={`${n}-${i}`}
              className="px-1.5 py-0.5 rounded text-xs font-bold"
              style={{
                background: i === 0 ? 'var(--gold)' : 'rgba(255,255,255,0.1)',
                color: i === 0 ? 'var(--dark)' : 'white',
              }}
            >
              {n}
            </span>
          ))}
        </div>
      </div>
    )}
  </div>
));
DrawnNumbersPanel.displayName = 'DrawnNumbersPanel';

// Last drawn number — isolated so only it animates
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

export const PlayerGame: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [game, setGame] = useState<Game | null>(null);
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([]);
  const [card, setCard] = useState<BingoCardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [bingoClaimed, setBingoClaimed] = useState(false);
  const [bingoVerified, setBingoVerified] = useState<boolean | null>(null);

  // Improvement 5: Winners list from realtime
  const [winners, setWinners] = useState<Winner[]>([]);

  // Tie-breaking vote state
  const [tieVoteModal, setTieVoteModal] = useState<TieVotePayload | null>(null);
  const [myTieVote, setMyTieVote] = useState<'accept' | 'reject' | null>(null);
  const [tieCountdown, setTieCountdown] = useState(60);
  const [tieVoteResult, setTieVoteResult] = useState<'accept' | 'reject' | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardRef = useRef<BingoCardData | null>(null);
  const gpIdRef = useRef<string | null>(null);
  const drawnRef = useRef<number[]>([]);
  const gameModeRef = useRef<string[]>([]);

  const currentPlayer = useMemo(() => {
    const s = localStorage.getItem('bingo_player');
    return s ? JSON.parse(s) : null;
  }, []);

  const fetchData = useCallback(async () => {
    if (!code || !currentPlayer) return;
    setLoading(true);

    const { data: gameData } = await supabase
      .from('games')
      .select('*')
      .eq('code', code)
      .maybeSingle();

    if (!gameData) {
      toast.error('Jogo não encontrado');
      navigate('/');
      return;
    }

    const { data: gpData } = await supabase
      .from('game_players')
      .select('*')
      .eq('game_id', gameData.id)
      .eq('player_id', currentPlayer.id)
      .maybeSingle();

    const drawn = (gameData as Game).drawn_numbers ?? [];
    setGame(gameData as Game);
    setDrawnNumbers(drawn);
    drawnRef.current = drawn;
    gameModeRef.current = (gameData as Game).mode ?? [];

    if (gpData) {
      const gp = gpData as GamePlayer;
      setCard(gp.card);
      setBingoClaimed(gp.bingo_claimed);
      setBingoVerified(gp.bingo_verified ?? null);
      cardRef.current = gp.card;
      gpIdRef.current = gp.id;
    }

    setLoading(false);
  }, [code, currentPlayer, navigate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Persist card helper
  const persistCard = useCallback(async (updatedCard: BingoCardData) => {
    if (!gpIdRef.current) return;
    await supabase.from('game_players').update({ card: updatedCard }).eq('id', gpIdRef.current);
  }, []);

  // Improvement 3: Auto-mark helper
  const autoMarkCard = useCallback((drawn: number[]) => {
    const current = cardRef.current;
    if (!current) return;
    const newMarked = current.numbers.map((row, ri) =>
      row.map((num, ci) => {
        if (ri === 2 && ci === 2) return true; // FREE
        if (current.marked[ri][ci]) return true; // already marked
        return drawn.includes(num);
      })
    );
    const changed = newMarked.some((row, ri) => row.some((val, ci) => val !== current.marked[ri][ci]));
    if (!changed) return;
    const newCard: BingoCardData = { ...current, marked: newMarked };
    setCard(newCard);
    cardRef.current = newCard;
    // Persist immediately (no debounce for auto-mark)
    persistCard(newCard);
  }, [persistCard]);

  useEffect(() => {
    if (!code) return;
    const unsubscribe = subscribeToGame(code, (msg) => {
      if (msg.type === 'draw') {
        const payload = msg.payload as { number: number; drawnNumbers: number[] };
        drawnRef.current = payload.drawnNumbers;
        setDrawnNumbers(payload.drawnNumbers);
        toast(`🎱 ${payload.number}`, { duration: 2000 });

        // Improvement 3: Auto-mark if game mode includes auto_mark
        if (gameModeRef.current.includes('auto_mark')) {
          autoMarkCard(payload.drawnNumbers);
        }
      } else if (msg.type === 'status') {
        const payload = msg.payload as { status: Game['status'] };
        setGame((g) => g ? { ...g, status: payload.status } : g);
        if (payload.status === 'running') toast.success(t('notification.gameStarted'));
        else if (payload.status === 'finished') toast(t('notification.gameEnded'));
      } else if (msg.type === 'verify') {
        const payload = msg.payload as { gamePlerId: string; verified: boolean };
        if (payload.gamePlerId === gpIdRef.current) {
          setBingoVerified(payload.verified);
          if (payload.verified) toast.success(t('game.bingoVerified'));
          else toast.error(t('game.bingoRejected'));
        }
      } else if (msg.type === 'winner') {
        // Improvement 5: Receive winners update
        const payload = msg.payload as { winners: Winner[] };
        setWinners(payload.winners ?? []);
      } else if (msg.type === 'tie_decision') {
        // Improvement 6: Host decided on tie
        toast(t('game.tieDecision'), { duration: 4000 });
      } else if (msg.type === 'tie_vote') {
        const payload = msg.payload as TieVotePayload;
        const myId = currentPlayer?.id;
        if (payload.tiedPlayers.some((p) => p.id === myId)) {
          setTieVoteModal(payload);
          setMyTieVote(null);
          setTieVoteResult(null);
          setTieCountdown(60);
        }
      }
    });
    return unsubscribe;
  }, [code, t, autoMarkCard]);

  // Keep gameModeRef in sync when game changes
  useEffect(() => {
    if (game) gameModeRef.current = game.mode;
  }, [game?.mode]);

  // Tie vote countdown
  useEffect(() => {
    if (!tieVoteModal) return;
    const interval = setInterval(() => {
      setTieCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setTieVoteModal(null); // timeout = silence = loss
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [tieVoteModal]);

  // Handle player's tie vote decision
  const handleTieVote = useCallback(async (decision: 'accept' | 'reject') => {
    if (!game || !currentPlayer || !tieVoteModal) return;
    setMyTieVote(decision);
    setTieVoteResult(decision);
    await broadcastToGame(game.code, 'tie_response', {
      playerId: currentPlayer.id,
      decision,
    });
    // Close modal after short delay so the result feedback is visible
    setTimeout(() => {
      setTieVoteModal(null);
      // Clear result feedback after another moment
      setTimeout(() => setTieVoteResult(null), 2000);
    }, 1800);
  }, [game, currentPlayer, tieVoteModal]);

  // Improvement 4: Traditional mode = no auto_mark AND no cartela_cheia
  const isTraditionalMode = game
    ? !game.mode.includes('auto_mark') && !game.mode.includes('cartela_cheia')
    : true;

  // Cell click — always allowed; warns only in non-traditional mode
  const handleCellClick = useCallback((row: number, col: number, number: number) => {
    const currentCard = cardRef.current;
    if (!currentCard) return;
    if (row === 2 && col === 2) return;

    // Improvement 4: only warn in non-traditional mode
    if (!isTraditionalMode && number !== 0 && !drawnRef.current.includes(number)) {
      toast(t('game.cellNotDrawn'), { icon: '⚠️' });
    }

    const newMarked = currentCard.marked.map((r, ri) =>
      r.map((val, ci) => (ri === row && ci === col ? !val : val))
    );
    const newCard: BingoCardData = { ...currentCard, marked: newMarked };
    setCard(newCard);
    cardRef.current = newCard;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => persistCard(newCard), DEBOUNCE_MS);
  }, [persistCard, t, isTraditionalMode]);

  const handleClaimBingo = useCallback(async () => {
    if (!game || bingoClaimed || !cardRef.current) return;
    const check = checkBingo(cardRef.current);
    if (!check.hasPartialBingo && !check.hasFullBingo) {
      toast.error('Você não tem bingo ainda!');
      return;
    }
    try {
      await supabase
        .from('game_players')
        .update({ bingo_claimed: true, bingo_claimed_at: new Date().toISOString() })
        .eq('id', gpIdRef.current!);
      await broadcastToGame(game.code, 'bingo', {
        playerId: currentPlayer.id,
        nickname: currentPlayer.nickname,
      });
      setBingoClaimed(true);
      toast.success('🎉 BINGO enviado!');
    } catch {
      toast.error('Erro ao reivindicar bingo');
    }
  }, [game, bingoClaimed, currentPlayer]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white/60 text-lg">{t('common.loading')}</div>
      </div>
    );
  }

  if (!game || !card) {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-4">
        <div className="text-white/60 text-lg">Jogo não encontrado</div>
        <button className="btn-primary" onClick={() => navigate('/')}>Voltar ao início</button>
      </div>
    );
  }

  const lastDrawn = drawnNumbers.length > 0 ? drawnNumbers[drawnNumbers.length - 1] : null;

  // Winner type labels
  const winnerTypeLabel = (type: Winner['type']) => {
    const map: Record<Winner['type'], string> = {
      linha: 'Linha', coluna: 'Coluna', diagonal: 'Diagonal',
      cartela_cheia: 'Cartela Cheia', empate: 'Empate',
    };
    return map[type] ?? type;
  };

  // Build other player names for the tie modal
  const tieOtherNames = tieVoteModal
    ? tieVoteModal.tiedPlayers
        .filter((p) => p.id !== currentPlayer?.id)
        .map((p) => p.nickname)
        .join(', ')
    : '';

  return (
    <div className="min-h-screen px-4 py-6">
      <div className="max-w-4xl mx-auto">

      {/* Tie Vote Modal — full-screen overlay */}
      {tieVoteModal && myTieVote === null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(26,26,46,0.92)' }}
        >
          <div
            className="w-full max-w-sm mx-4 rounded-3xl p-6 text-center"
            style={{
              background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
              border: '2px solid var(--gold)',
              boxShadow: '0 0 40px rgba(255,204,0,0.3)',
            }}
          >
            <div className="text-5xl mb-3">⚖️</div>
            <h2 className="font-title text-3xl mb-1" style={{ color: 'var(--gold)' }}>
              EMPATE!
            </h2>
            <p className="text-white/70 text-sm mb-1">
              Você empatou com <span className="font-bold text-white">{tieOtherNames}</span>
            </p>
            <p className="text-white/60 text-sm mb-4">Deseja aceitar o empate?</p>

            {/* Countdown */}
            <div className="mb-5">
              <div className="flex items-center justify-center gap-2 mb-2">
                <span className="text-lg">⏱️</span>
                <span className="font-bold text-xl" style={{ color: 'var(--gold)' }}>
                  {tieCountdown} segundos
                </span>
              </div>
              <div
                className="w-full rounded-full h-2"
                style={{ background: 'rgba(255,255,255,0.15)' }}
              >
                <div
                  className="h-2 rounded-full transition-all duration-1000"
                  style={{
                    width: `${(tieCountdown / 60) * 100}%`,
                    background: tieCountdown > 20 ? 'var(--gold)' : 'var(--red)',
                  }}
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                className="flex-1 py-3 rounded-2xl font-bold text-base"
                style={{ background: 'var(--green)', color: 'white' }}
                onClick={() => handleTieVote('accept')}
              >
                ✅ ACEITAR
              </button>
              <button
                className="flex-1 py-3 rounded-2xl font-bold text-base"
                style={{ background: 'var(--red)', color: 'white' }}
                onClick={() => handleTieVote('reject')}
              >
                ❌ RECUSAR
              </button>
            </div>

            <p className="text-xs text-white/40 mt-3">
              Aceitar = compartilhar prêmio &nbsp;·&nbsp; Recusar/silêncio = perder
            </p>
          </div>
        </div>
      )}

      {/* Tie vote result feedback */}
      {tieVoteResult !== null && tieVoteModal === null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          style={{ background: 'rgba(26,26,46,0.85)' }}
        >
          <div
            className="text-2xl font-bold px-8 py-6 rounded-2xl"
            style={{
              background: tieVoteResult === 'accept' ? 'rgba(26,171,90,0.9)' : 'rgba(224,32,32,0.9)',
              color: 'white',
            }}
          >
            {tieVoteResult === 'accept' ? '✅ Voto registrado!' : '❌ Você recusou'}
          </div>
        </div>
      )}
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h1 className="font-title text-3xl sm:text-4xl" style={{ color: 'var(--gold)' }}>
              {t('game.title')}
            </h1>
            <span className="text-white/50 font-mono text-lg tracking-widest">{game.code}</span>
          </div>
          <div
            className="text-xs px-2 py-1 rounded-full font-bold"
            style={{
              background: game.status === 'running' ? 'rgba(26,171,90,0.2)' : game.status === 'finished' ? 'rgba(224,32,32,0.2)' : 'rgba(255,204,0,0.2)',
              color: game.status === 'running' ? '#1aab5a' : game.status === 'finished' ? '#e02020' : '#FFCC00',
            }}
          >
            {game.status === 'waiting' && '⏳ Aguardando'}
            {game.status === 'running' && '🟢 Em andamento'}
            {game.status === 'finished' && '🏁 Finalizado'}
          </div>
        </div>

        {/* Improvement 5: Winners banner — non-blocking list at top */}
        {winners.length > 0 && (
          <div
            className="glass-card p-3 mb-4"
            style={{ borderLeft: '3px solid var(--gold)' }}
          >
            <div className="text-sm font-bold mb-1" style={{ color: 'var(--gold)' }}>
              🏆 {t('game.winnersTitle')}
            </div>
            <div className="flex flex-wrap gap-2">
              {winners.map((w, i) => (
                <span
                  key={i}
                  className="text-xs px-2 py-1 rounded-lg font-semibold"
                  style={{ background: 'rgba(255,204,0,0.15)', color: 'var(--gold)' }}
                >
                  {w.nickname} — {winnerTypeLabel(w.type)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Last drawn — isolated component, no flash to rest of page */}
        <LastDrawnDisplay lastDrawn={lastDrawn} t={t} />

        {game.status === 'finished' && (
          <div
            className="text-center py-4 mb-4 rounded-2xl font-title text-xl animate-gold-glow"
            style={{ background: 'rgba(255,204,0,0.1)', color: 'var(--gold)' }}
          >
            {t('game.gameFinished')}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4 items-start">
          {/* Left: Bingo Card — only re-renders when card.marked changes */}
          <div>
            <h2 className="text-white/70 text-sm font-semibold mb-2 uppercase tracking-wide">
              {t('game.myCard')}
            </h2>
            <BingoCard
              card={card}
              onCellClick={handleCellClick}
              size="md"
            />

            {game.status === 'running' && (
              <div className="mt-3">
                {bingoClaimed ? (
                  <div
                    className="w-full py-3 rounded-xl text-center font-bold text-lg"
                    style={{
                      background: bingoVerified === true ? 'var(--green)' : bingoVerified === false ? 'var(--red)' : 'rgba(255,204,0,0.3)',
                      color: bingoVerified === null ? 'var(--gold)' : 'white',
                    }}
                  >
                    {bingoVerified === true ? t('game.bingoVerified') : bingoVerified === false ? t('game.bingoRejected') : t('game.bingoSent')}
                  </div>
                ) : (
                  <button className="btn-primary w-full py-3 text-xl rounded-xl" onClick={handleClaimBingo}>
                    {t('game.claimBingo')}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Right: Drawn numbers — isolated component */}
          <DrawnNumbersPanel
            drawnNumbers={drawnNumbers}
            rangeMin={game.number_range_min}
            rangeMax={game.number_range_max}
            lastDrawn={lastDrawn}
            t={t}
          />
        </div>
      </div>
    </div>
  );
};
