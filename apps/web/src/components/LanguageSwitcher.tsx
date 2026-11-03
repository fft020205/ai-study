'use client';

import {useTranslation} from 'react-i18next';
import {normalizeLanguage, selectLanguage, supportedLanguages, type Language} from '@/i18n';

export function LanguageSwitcher() {
  const {t, i18n} = useTranslation();
  const language = normalizeLanguage(i18n.resolvedLanguage ?? i18n.language) ?? 'zh-CN';
  return <span className="language-select">
    <select
      className="language-switcher"
      aria-label={t('language.label')}
      value={language}
      onChange={event => { void selectLanguage(event.target.value as Language); }}
    >
      {supportedLanguages.map(value => <option key={value} value={value}>{t(value === 'zh-CN' ? 'language.zh' : 'language.en')}</option>)}
    </select>
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true" focusable="false">
      <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  </span>;
}
