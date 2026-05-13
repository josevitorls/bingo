import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { generateUniqueCode } from '../lib/gameCode';
import { generateCard, hashCard } from '../lib/cardGenerator';
import type { GameMode } from '../types';

const WIN_MODES: GameMode[] = ['linha', 'coluna', 'diagonal', 'cartela_cheia', 'primeiro_a_acertar', 'ultimo_a_acertar'];

export const CreateGame: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [nickname, setNickname] = useState('');
  const [alsoJoin, setAlsoJoin] = useState(false);
  const [modes, setModes] = useState<GameMode[]>(['linha']);
  const [autoMark, setAutoMark] = useState(false);
  const [rangeMin, setRangeMin] = useState(1);
  const [rangeMax, setRangeMax] = useState(75);
  const [drawMode, setDrawMode] = useState<'manual' | 'auto'>('manual');
  const [interval, setInterval_] = useState(15);
  const [creating, setCreating] = useState(false);

  const toggleMode = (mode: GameMode) => {
    setModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!nickname.trim()) {
      toast.error(t('create.errors.nicknameRequired'));
      return;
    }
    const winModes = modes.filter((m) => WIN_MODES.includes(m));
    if (winModes.length === 0) {
      toast.error(t('create.errors.modeRequired'));
      return;
    }
    if (rangeMax - rangeMin < 24) {
      toast.error(t('create.errors.rangeinvalid'));
      return;
    }
    if (drawMode === 'auto' && (interval < 1 || interval > 60)) {
      toast.error(t('create.errors.intervalInvalid'));
      return;
    }

    setCreating(true);

    try {
      // Create or find player
      const storedPlayer = localStorage.getItem('bingo_player');
      let playerId: string;

      if (storedPlayer) {
        const p = JSON.parse(storedPlayer);
        playerId = p.id;
      } else {
        const { data: player, error: playerError } = await supabase
          .from('players')
          .insert({ nickname: nickname.trim(), is_guest: true })
          .select()
          .single();

        if (playerError) throw playerError;
        playerId = player.id;
        localStorage.setItem('bingo_player', JSON.stringify(player));
      }

      // Generate unique code & host token
      const code = await generateUniqueCode();
      const hostToken = crypto.randomUUID();

      // Store host token
      localStorage.setItem(`bingo_host_token_${code}`, hostToken);

      // Build final modes array (include auto_mark if checked)
      const finalModes: GameMode[] = autoMark ? [...modes, 'auto_mark'] : modes;

      // Create game
      const { data: game, error: gameError } = await supabase
        .from('games')
        .insert({
          code,
          host_token: hostToken,
          host_player_id: playerId,
          status: 'waiting',
          mode: finalModes,
          number_range_min: rangeMin,
          number_range_max: rangeMax,
          auto_draw_interval: drawMode === 'auto' ? interval : null,
        })
        .select()
        .single();

      if (gameError) throw gameError;

      // If host also joins as player, create their card
      if (alsoJoin) {
        const card = generateCard(rangeMin, rangeMax);
        const cardHash = await hashCard(card);

        const { error: gpError } = await supabase
          .from('game_players')
          .insert({
            game_id: game.id,
            player_id: playerId,
            card,
          });

        if (gpError) throw gpError;

        // Record card hash
        await supabase.from('card_history').insert({
          player_id: playerId,
          card_hash: cardHash,
          game_id: game.id,
        });
      }

      toast.success(`Jogo criado! Código: ${code}`);
      navigate(`/host/${code}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao criar jogo';
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-lg mx-auto">
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
            {t('create.title')}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Nickname */}
          <div className="glass-card p-4 sm:p-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-1 text-white/80">
                {t('create.hostNickname')}
              </label>
              <input
                className="input-field"
                type="text"
                placeholder={t('create.hostNicknamePlaceholder')}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={30}
                required
              />
            </div>

            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={alsoJoin}
                onChange={(e) => setAlsoJoin(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm text-white/80">{t('create.alsoJoin')}</span>
            </label>
          </div>

          {/* Win modes */}
          <div className="glass-card p-4 sm:p-6">
            <h3 className="font-bold text-white/90 mb-3">{t('create.modes')}</h3>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {WIN_MODES.map((mode) => (
                <label
                  key={mode}
                  className="flex items-center gap-2 cursor-pointer select-none p-2 rounded-lg transition-colors"
                  style={{
                    background: modes.includes(mode)
                      ? 'rgba(255,204,0,0.15)'
                      : 'rgba(255,255,255,0.05)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={modes.includes(mode)}
                    onChange={() => toggleMode(mode)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium">
                    {t(`create.mode_${mode}`)}
                  </span>
                </label>
              ))}
            </div>

            {/* Auto-mark option */}
            <div className="border-t border-white/10 pt-3">
              <label
                className="flex items-start gap-3 cursor-pointer select-none p-2 rounded-lg transition-colors"
                style={{
                  background: autoMark ? 'rgba(255,204,0,0.15)' : 'rgba(255,255,255,0.05)',
                }}
              >
                <input
                  type="checkbox"
                  checked={autoMark}
                  onChange={(e) => setAutoMark(e.target.checked)}
                  className="w-4 h-4 mt-0.5 shrink-0"
                />
                <span className="text-sm font-medium">{t('create.auto_mark_label')}</span>
              </label>
            </div>
          </div>

          {/* Number range */}
          <div className="glass-card p-4 sm:p-6">
            <h3 className="font-bold text-white/90 mb-3">{t('create.numberRange')}</h3>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-xs text-white/60 mb-1">{t('create.rangeMin')}</label>
                <input
                  className="input-field"
                  type="number"
                  min={1}
                  max={rangeMax - 24}
                  value={rangeMin}
                  onChange={(e) => setRangeMin(Number(e.target.value))}
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-white/60 mb-1">{t('create.rangeMax')}</label>
                <input
                  className="input-field"
                  type="number"
                  min={rangeMin + 24}
                  max={999}
                  value={rangeMax}
                  onChange={(e) => setRangeMax(Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          {/* Draw mode */}
          <div className="glass-card p-4 sm:p-6">
            <h3 className="font-bold text-white/90 mb-3">{t('create.drawMode')}</h3>
            <div className="flex gap-3 mb-4">
              {(['manual', 'auto'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`flex-1 py-2 rounded-xl font-bold text-sm transition-colors ${
                    drawMode === m
                      ? 'text-dark'
                      : 'btn-secondary'
                  }`}
                  style={drawMode === m ? { background: 'var(--gold)', color: 'var(--dark)' } : {}}
                  onClick={() => setDrawMode(m)}
                >
                  {t(`create.${m}`)}
                </button>
              ))}
            </div>

            {drawMode === 'auto' && (
              <div>
                <label className="block text-xs text-white/60 mb-1">
                  {t('create.interval')}
                </label>
                <div className="flex gap-2 mb-2">
                  {[10, 20, 30].map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="px-3 py-1.5 rounded-lg text-sm font-bold"
                      style={{
                        background: interval === s ? 'var(--gold)' : 'rgba(255,255,255,0.1)',
                        color: interval === s ? 'var(--dark)' : 'white',
                      }}
                      onClick={() => setInterval_(s)}
                    >
                      {s}s
                    </button>
                  ))}
                </div>
                <input
                  className="input-field"
                  type="number"
                  min={1}
                  max={60}
                  value={interval}
                  onChange={(e) => setInterval_(Number(e.target.value))}
                />
                <p className="text-xs text-white/40 mt-1">{t('create.intervalHelp')}</p>
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="btn-primary w-full text-lg py-4 rounded-2xl disabled:opacity-50"
            disabled={creating}
          >
            {creating ? t('create.creating') : t('create.submit')}
          </button>
        </form>
      </div>
    </div>
  );
};
