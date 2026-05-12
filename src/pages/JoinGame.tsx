import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { generateCard, hashCard } from '../lib/cardGenerator';
import { broadcastToGame } from '../lib/realtime';

export const JoinGame: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();

  const [code, setCode] = useState(searchParams.get('code') ?? '');
  const [nickname, setNickname] = useState('');
  const [joining, setJoining] = useState(false);

  // Pre-fill nickname from stored player
  useEffect(() => {
    const stored = localStorage.getItem('bingo_player');
    if (stored) {
      const p = JSON.parse(stored);
      setNickname(p.nickname ?? '');
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedCode = code.trim().toUpperCase();
    const trimmedNickname = nickname.trim();

    if (!trimmedCode) {
      toast.error(t('join.errors.codeRequired'));
      return;
    }
    if (trimmedCode.length !== 4) {
      toast.error(t('join.errors.codeLength'));
      return;
    }
    if (!trimmedNickname) {
      toast.error(t('join.errors.nicknameRequired'));
      return;
    }

    setJoining(true);

    try {
      // Find game
      const { data: game, error: gameError } = await supabase
        .from('games')
        .select('*')
        .eq('code', trimmedCode)
        .maybeSingle();

      if (gameError) throw gameError;
      if (!game) {
        toast.error(t('join.errors.gameNotFound'));
        return;
      }
      if (game.status !== 'waiting') {
        toast.error(t('join.errors.gameNotWaiting'));
        return;
      }

      // Get or create player
      let playerId: string;
      const stored = localStorage.getItem('bingo_player');

      if (stored) {
        const p = JSON.parse(stored);
        playerId = p.id;

        // Update nickname if changed
        if (p.nickname !== trimmedNickname) {
          await supabase
            .from('players')
            .update({ nickname: trimmedNickname })
            .eq('id', playerId);
          localStorage.setItem('bingo_player', JSON.stringify({ ...p, nickname: trimmedNickname }));
        }
      } else {
        const { data: player, error: playerError } = await supabase
          .from('players')
          .insert({ nickname: trimmedNickname, is_guest: true })
          .select()
          .single();

        if (playerError) throw playerError;
        playerId = player.id;
        localStorage.setItem('bingo_player', JSON.stringify(player));
      }

      // Check if already joined
      const { data: existingGP } = await supabase
        .from('game_players')
        .select('id')
        .eq('game_id', game.id)
        .eq('player_id', playerId)
        .maybeSingle();

      if (existingGP) {
        // Already joined, just navigate
        navigate(`/game/${trimmedCode}`);
        return;
      }

      // Generate card
      const card = generateCard(game.number_range_min, game.number_range_max);
      const cardHash = await hashCard(card);

      // Join game
      const { error: gpError } = await supabase
        .from('game_players')
        .insert({
          game_id: game.id,
          player_id: playerId,
          card,
        });

      if (gpError) throw gpError;

      // Record card history
      await supabase.from('card_history').insert({
        player_id: playerId,
        card_hash: cardHash,
        game_id: game.id,
      });

      // Broadcast player joined
      await broadcastToGame(trimmedCode, 'players', {
        type: 'joined',
        playerId,
        nickname: trimmedNickname,
      });

      toast.success('Entrou no jogo!');
      navigate(`/game/${trimmedCode}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao entrar no jogo';
      toast.error(msg);
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            className="text-white/60 hover:text-white text-2xl"
            onClick={() => navigate('/')}
            aria-label={t('common.back')}
          >
            ←
          </button>
          <h1 className="font-title text-3xl sm:text-4xl" style={{ color: 'var(--gold)' }}>
            {t('join.title')}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="glass-card p-6 space-y-5">
          {/* Code input */}
          <div>
            <label className="block text-sm font-semibold mb-1 text-white/80">
              {t('join.codeLabel')}
            </label>
            <input
              className="input-field text-center font-title text-3xl tracking-widest uppercase"
              type="text"
              placeholder={t('join.codePlaceholder')}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
              maxLength={4}
              autoComplete="off"
              autoCapitalize="characters"
              required
            />
          </div>

          {/* Nickname input */}
          <div>
            <label className="block text-sm font-semibold mb-1 text-white/80">
              {t('join.nicknameLabel')}
            </label>
            <input
              className="input-field"
              type="text"
              placeholder={t('join.nicknamePlaceholder')}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={30}
              required
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="btn-primary w-full text-lg py-3 rounded-xl disabled:opacity-50"
            disabled={joining}
          >
            {joining ? t('join.joining') : t('join.submit')}
          </button>
        </form>

        {/* Auth link */}
        <div className="text-center mt-4">
          <button
            className="text-white/40 text-sm hover:text-white/60 transition-colors"
            onClick={() => navigate('/auth')}
          >
            {t('join.loginOptional')}
          </button>
        </div>
      </div>
    </div>
  );
};
