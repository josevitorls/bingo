import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { subscribeToGame, broadcastToGame } from '../lib/realtime';
import { checkBingo } from '../lib/bingoChecker';
import { BingoCard } from '../components/BingoCard';
import { NumberBoard } from '../components/NumberBoard';
import type { BingoCardData, Game, GamePlayer } from '../types';

const DEBOUNCE_MS = 500;

export const PlayerGame: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [game, setGame] = useState<Game | null>(null);
  const [myGamePlayer, setMyGamePlayer] = useState<GamePlayer | null>(null);
  const [card, setCard] = useState<BingoCardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [bingoClaimed, setBingoClaimed] = useState(false);
  const [bingoVerified, setBingoVerified] = useState<boolean | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardRef = useRef<BingoCardData | null>(null);
  const gpIdRef = useRef<string | null>(null);

  const currentPlayer = (() => {
    const s = localStorage.getItem('bingo_player');
    return s ? JSON.parse(s) : null;
  })();

  // Fetch initial game data
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

    setGame(gameData as Game);

    if (gpData) {
      const gp = gpData as GamePlayer;
      setMyGamePlayer(gp);
      setCard(gp.card);
      setBingoClaimed(gp.bingo_claimed);
      setBingoVerified(gp.bingo_verified ?? null);
      cardRef.current = gp.card;
      gpIdRef.current = gp.id;
    }

    setLoading(false);
  }, [code, currentPlayer?.id, navigate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime subscription
  useEffect(() => {
    if (!code) return;

    const unsubscribe = subscribeToGame(code, (msg) => {
      if (msg.type === 'draw') {
        const payload = msg.payload as { number: number; drawnNumbers: number[] };
        setGame((g) => g ? { ...g, drawn_numbers: payload.drawnNumbers } : g);
        toast(`🎱 ${payload.number}`, { duration: 2000 });
      } else if (msg.type === 'status') {
        const payload = msg.payload as { status: Game['status'] };
        setGame((g) => g ? { ...g, status: payload.status } : g);
        if (payload.status === 'running') {
          toast.success(t('notification.gameStarted'));
        } else if (payload.status === 'finished') {
          toast(t('notification.gameEnded'));
        }
      } else if (msg.type === 'verify') {
        const payload = msg.payload as { gamePlerId: string; verified: boolean };
        if (payload.gamePlerId === gpIdRef.current) {
          setBingoVerified(payload.verified);
          if (payload.verified) {
            toast.success(t('game.bingoVerified'));
          } else {
            toast.error(t('game.bingoRejected'));
          }
        }
      }
    });

    return unsubscribe;
  }, [code, t]);

  // Persist card changes with debounce
  const persistCard = useCallback(async (updatedCard: BingoCardData) => {
    if (!gpIdRef.current) return;
    await supabase
      .from('game_players')
      .update({ card: updatedCard })
      .eq('id', gpIdRef.current);
  }, []);

  const handleCellClick = useCallback(
    (row: number, col: number, number: number) => {
      if (!card || !game) return;
      if (row === 2 && col === 2) return; // FREE cell

      // Check if number was drawn
      if (number !== 0 && !game.drawn_numbers.includes(number)) {
        toast(t('game.cellNotDrawn'), { icon: '⚠️' });
        return;
      }

      const newMarked = card.marked.map((r, ri) =>
        r.map((val, ci) => {
          if (ri === row && ci === col) return !val;
          return val;
        })
      );

      const newCard: BingoCardData = { ...card, marked: newMarked };
      setCard(newCard);
      cardRef.current = newCard;

      // Debounce persistence
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        persistCard(newCard);
      }, DEBOUNCE_MS);
    },
    [card, game, persistCard, t]
  );

  const handleClaimBingo = async () => {
    if (!game || !myGamePlayer || bingoClaimed) return;
    if (!card) return;

    const check = checkBingo(card);
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
        nickname: currentPlayer.nickname,
      });

      setBingoClaimed(true);
      toast.success('🎉 BINGO enviado!');
    } catch {
      toast.error('Erro ao reivindicar bingo');
    }
  };

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
        <button className="btn-primary" onClick={() => navigate('/')}>
          Voltar ao início
        </button>
      </div>
    );
  }

  const lastDrawn =
    game.drawn_numbers.length > 0
      ? game.drawn_numbers[game.drawn_numbers.length - 1]
      : null;

  return (
    <div className="min-h-screen px-4 py-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h1
              className="font-title text-3xl sm:text-4xl"
              style={{ color: 'var(--gold)' }}
            >
              {t('game.title')}
            </h1>
            <span
              className="text-white/50 font-mono text-lg tracking-widest"
            >
              {game.code}
            </span>
          </div>

          {/* Game status */}
          <div
            className="text-xs px-2 py-1 rounded-full font-bold"
            style={{
              background:
                game.status === 'running'
                  ? 'rgba(26,171,90,0.2)'
                  : game.status === 'finished'
                  ? 'rgba(224,32,32,0.2)'
                  : 'rgba(255,204,0,0.2)',
              color:
                game.status === 'running'
                  ? '#1aab5a'
                  : game.status === 'finished'
                  ? '#e02020'
                  : '#FFCC00',
            }}
          >
            {game.status === 'waiting' && '⏳ Aguardando'}
            {game.status === 'running' && '🟢 Em andamento'}
            {game.status === 'finished' && '🏁 Finalizado'}
          </div>
        </div>

        {/* Last drawn number */}
        {lastDrawn && (
          <div
            className="text-center py-3 mb-4 glass-card"
            key={lastDrawn}
          >
            <div className="text-xs text-white/50 mb-1">{t('game.lastDrawn')}</div>
            <div
              className="font-title text-5xl sm:text-6xl animate-number-pop"
              style={{ color: 'var(--gold)' }}
            >
              {lastDrawn}
            </div>
          </div>
        )}

        {/* Game finished message */}
        {game.status === 'finished' && (
          <div
            className="text-center py-4 mb-4 rounded-2xl font-title text-xl animate-gold-glow"
            style={{ background: 'rgba(255,204,0,0.1)', color: 'var(--gold)' }}
          >
            {t('game.gameFinished')}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4 items-start">
          {/* Left: Bingo Card */}
          <div>
            <h2 className="text-white/70 text-sm font-semibold mb-2 uppercase tracking-wide">
              {t('game.myCard')}
            </h2>
            <BingoCard
              card={card}
              drawnNumbers={game.drawn_numbers}
              onCellClick={game.status === 'running' ? handleCellClick : undefined}
              readonly={game.status !== 'running'}
              size="md"
            />

            {/* Bingo button */}
            {game.status === 'running' && (
              <div className="mt-3">
                {bingoClaimed ? (
                  <div
                    className="w-full py-3 rounded-xl text-center font-bold text-lg"
                    style={{
                      background:
                        bingoVerified === true
                          ? 'var(--green)'
                          : bingoVerified === false
                          ? 'var(--red)'
                          : 'rgba(255,204,0,0.3)',
                      color: bingoVerified === null ? 'var(--gold)' : 'white',
                    }}
                  >
                    {bingoVerified === true
                      ? t('game.bingoVerified')
                      : bingoVerified === false
                      ? t('game.bingoRejected')
                      : t('game.bingoSent')}
                  </div>
                ) : (
                  <button
                    className="btn-primary w-full py-3 text-xl rounded-xl"
                    onClick={handleClaimBingo}
                  >
                    {t('game.claimBingo')}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Right: Number board */}
          <div className="glass-card p-4">
            <h2 className="text-white/70 text-sm font-semibold mb-3 uppercase tracking-wide">
              {t('game.drawnNumbers')} ({game.drawn_numbers.length})
            </h2>
            {game.drawn_numbers.length === 0 ? (
              <div className="text-center text-white/40 py-4 text-sm">
                {t('game.noNumbers')}
              </div>
            ) : (
              <NumberBoard
                drawnNumbers={game.drawn_numbers}
                rangeMin={game.number_range_min}
                rangeMax={game.number_range_max}
                lastDrawn={lastDrawn}
              />
            )}

            {/* Drawn order history */}
            {game.drawn_numbers.length > 0 && (
              <div className="mt-4">
                <div className="text-xs text-white/40 mb-2">Ordem dos sorteios</div>
                <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                  {[...game.drawn_numbers].reverse().map((n, i) => (
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
        </div>
      </div>
    </div>
  );
};
