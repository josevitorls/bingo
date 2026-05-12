import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';

type Mode = 'login' | 'register' | 'guest';

export const Auth: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { login, register, createGuest, player, logout } = useAuth();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === 'guest') {
        if (!nickname.trim()) {
          toast.error(t('auth.errors.nicknameRequired'));
          return;
        }
        await createGuest(nickname.trim());
        toast.success('Entrando como convidado!');
        navigate('/');
      } else if (mode === 'login') {
        if (!email.trim()) {
          toast.error(t('auth.errors.emailRequired'));
          return;
        }
        if (!password) {
          toast.error(t('auth.errors.passwordRequired'));
          return;
        }
        await login(email.trim(), password);
        toast.success('Bem-vindo de volta!');
        navigate('/');
      } else {
        // register
        if (!email.trim()) {
          toast.error(t('auth.errors.emailRequired'));
          return;
        }
        if (password.length < 6) {
          toast.error(t('auth.errors.passwordTooShort'));
          return;
        }
        if (!nickname.trim()) {
          toast.error(t('auth.errors.nicknameRequired'));
          return;
        }
        await register(email.trim(), password, nickname.trim());
        toast.success('Conta criada com sucesso!');
        navigate('/');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('common.error');
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // If already logged in
  if (player) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="glass-card p-8 w-full max-w-sm text-center space-y-4">
          <div className="text-4xl">👤</div>
          <div>
            <div className="text-sm text-white/60">{t('auth.loggedAs')}</div>
            <div className="text-xl font-bold text-white mt-1">{player.nickname}</div>
            {player.email && (
              <div className="text-sm text-white/50">{player.email}</div>
            )}
          </div>
          <button className="btn-danger w-full" onClick={logout}>
            {t('auth.logout')}
          </button>
          <button className="btn-secondary w-full" onClick={() => navigate('/')}>
            {t('common.back')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            className="text-white/60 hover:text-white text-2xl"
            onClick={() => navigate('/')}
          >
            ←
          </button>
          <h1
            className="font-title text-3xl sm:text-4xl"
            style={{ color: 'var(--gold)' }}
          >
            {t('auth.title')}
          </h1>
        </div>

        {/* Mode tabs */}
        <div
          className="flex rounded-xl overflow-hidden mb-6"
          style={{ background: 'rgba(255,255,255,0.07)' }}
        >
          {(['login', 'register', 'guest'] as Mode[]).map((m) => (
            <button
              key={m}
              className="flex-1 py-2.5 text-sm font-semibold transition-colors"
              style={
                mode === m
                  ? { background: 'var(--gold)', color: 'var(--dark)' }
                  : { color: 'rgba(255,255,255,0.6)' }
              }
              onClick={() => setMode(m)}
            >
              {m === 'login'
                ? t('auth.loginButton')
                : m === 'register'
                ? t('auth.registerButton')
                : 'Guest'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="glass-card p-6 space-y-4">
          {(mode === 'register' || mode === 'guest') && (
            <div>
              <label className="block text-sm font-semibold mb-1 text-white/80">
                {t('auth.nickname')}
              </label>
              <input
                className="input-field"
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Seu apelido"
                maxLength={30}
              />
            </div>
          )}

          {mode !== 'guest' && (
            <>
              <div>
                <label className="block text-sm font-semibold mb-1 text-white/80">
                  {t('auth.email')}
                </label>
                <input
                  className="input-field"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1 text-white/80">
                  {t('auth.password')}
                </label>
                <input
                  className="input-field"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            </>
          )}

          <button
            type="submit"
            className="btn-primary w-full py-3 text-lg rounded-xl disabled:opacity-50"
            disabled={loading}
          >
            {loading
              ? t('common.loading')
              : mode === 'login'
              ? t('auth.loginButton')
              : mode === 'register'
              ? t('auth.registerButton')
              : t('auth.guestButton')}
          </button>
        </form>
      </div>
    </div>
  );
};
