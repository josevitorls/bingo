import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import ptBR from './pt-BR.json';
import enUS from './en-US.json';

const savedLang = localStorage.getItem('bingo_lang') || 'pt-BR';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      'pt-BR': { translation: ptBR },
      'en-US': { translation: enUS },
    },
    lng: savedLang,
    fallbackLng: 'pt-BR',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
