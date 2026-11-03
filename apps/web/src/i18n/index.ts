import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import {initReactI18next} from 'react-i18next';
import {zhCN} from './zh-CN';
import {en} from './en';

export const defaultLanguage = 'zh-CN';
export const supportedLanguages = ['zh-CN', 'en'] as const;
export const languageStorageKey = 'study.interface-language';
export type Language = typeof supportedLanguages[number];

export function normalizeLanguage(value?: string|null): Language|null {
  const code = value?.trim().toLowerCase();
  if (!code) return null;
  if (code === 'zh' || code.startsWith('zh-')) return 'zh-CN';
  if (code === 'en' || code.startsWith('en-')) return 'en';
  return null;
}

void i18n.use(LanguageDetector).use(initReactI18next).init({
  resources: {'zh-CN': {translation: zhCN}, en: {translation: en}},
  lng: defaultLanguage,
  fallbackLng: defaultLanguage,
  supportedLngs: [...supportedLanguages],
  interpolation: {escapeValue: false},
  detection: {order: ['localStorage', 'navigator'], lookupLocalStorage: languageStorageKey, caches: []},
  react: {useSuspense: false},
  returnEmptyString: false
});

export function detectInitialLanguage(): Language {
  if (typeof window === 'undefined') return defaultLanguage;
  const detected = i18n.services.languageDetector?.detect() as string|string[]|null|undefined;
  const candidates = Array.isArray(detected) ? detected : detected ? [detected] : [];
  for (const candidate of candidates) {
    const language = normalizeLanguage(candidate);
    if (language) return language;
  }
  return defaultLanguage;
}

export async function selectLanguage(language: Language) {
  try { window.localStorage.setItem(languageStorageKey, language); } catch { /* 隐私浏览等场景可能禁止本地存储。 */ }
  await i18n.changeLanguage(language);
}

export {i18n};
export default i18n;
