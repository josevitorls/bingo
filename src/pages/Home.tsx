import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const toggleLang = () => {
    const next = i18n.language === 'pt-BR' ? 'en-US' : 'pt-BR';
    i18n.changeLanguage(next);
    localStorage.setItem('bingo_lang', next);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 relative">
      {/* Language switcher */}
      <button
        className="absolute top-4 right-4 btn-secondary text-sm px-3 py-2"
        onClick={toggleLang}
        aria-label="Switch language"
      >
        {i18n.language === 'pt-BR' ? '🇧🇷 PT' : '🇺🇸 EN'}
      </button>

      {/* Title */}
      <div className="text-center mb-12">
        <h1
          className="font-title text-7xl sm:text-8xl md:text-9xl mb-2 animate-gold-glow"
          style={{ color: 'var(--gold)' }}
        >
          {t('home.title')}
        </h1>
        <p className="text-white/70 text-lg sm:text-xl font-body">
          {t('home.subtitle')}
        </p>
      </div>

      {/* Main buttons */}
      <div className="w-full max-w-xs space-y-4">
        <button
          className="btn-primary w-full text-xl py-4 rounded-2xl shadow-lg"
          onClick={() => navigate('/create')}
        >
          {t('home.createGame')}
        </button>

        <button
          className="btn-secondary w-full text-xl py-4 rounded-2xl"
          onClick={() => navigate('/join')}
        >
          {t('home.joinGame')}
        </button>
      </div>

      {/* Auth link */}
      <div className="mt-12">
        <button
          className="text-white/40 text-sm hover:text-white/70 transition-colors"
          onClick={() => navigate('/auth')}
        >
          {t('home.login')}
        </button>
      </div>

      {/* Version */}
      <div className="absolute bottom-4 text-white/20 text-xs">
        {t('home.version')}
      </div>
    </div>
  );
};
