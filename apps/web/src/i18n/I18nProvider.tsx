'use client';

import {useEffect, type ReactNode} from 'react';
import {I18nextProvider} from 'react-i18next';
import i18n, {defaultLanguage, detectInitialLanguage, normalizeLanguage} from './index';

export function I18nProvider({children}:{children:ReactNode}) {
  useEffect(() => {
    const syncDocument = (value: string) => {
      const language = normalizeLanguage(value) ?? defaultLanguage;
      document.documentElement.lang = language;
      document.title = i18n.t('metadata.title', {lng: language});
      let description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (!description) {
        description = document.createElement('meta');
        description.name = 'description';
        document.head.append(description);
      }
      description.setAttribute('content', i18n.t('metadata.description', {lng: language}));
    };
    i18n.on('languageChanged', syncDocument);
    const initial = detectInitialLanguage();
    syncDocument(initial);
    if (i18n.language !== initial) void i18n.changeLanguage(initial);
    return () => { i18n.off('languageChanged', syncDocument); };
  }, []);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
