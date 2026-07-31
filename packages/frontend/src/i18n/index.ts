import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import commonZh from './locales/zh-CN/common.json';
import commonEn from './locales/en/common.json';
const DEFAULT_LNG = 'zh-CN';
const SUPPORTED_LNGS = ['zh-CN', 'en'] as const;
function normalizeLng(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_LNG;
  if (raw === 'en' || raw.startsWith('en-')) return 'en';
  if (raw === 'zh-CN' || raw.startsWith('zh')) return 'zh-CN';
  return SUPPORTED_LNGS.includes(raw as (typeof SUPPORTED_LNGS)[number]) ? raw : DEFAULT_LNG;
}
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': { common: commonZh },
      en: { common: commonEn }
    },
    fallbackLng: DEFAULT_LNG,
    supportedLngs: [...SUPPORTED_LNGS],
    ns: ['common'],
    defaultNS: 'common',
    partialBundledLanguages: false,
    lng: normalizeLng(
      (() => {
        try {
          return localStorage.getItem('i18nextLng');
        } catch {
          return null;
        }
      })() ?? (typeof navigator !== 'undefined' ? navigator.language : DEFAULT_LNG)
    ),
    interpolation: {
      escapeValue: false
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage']
    },
    react: {
      useSuspense: true
    }
  });
export async function loadNamespace(ns: string): Promise<void> {
  if (ns === 'common' || i18n.hasResourceBundle(i18n.language, ns)) return;
  try {
    const lang = i18n.language;
    const mod = await import(`./locales/${lang}/${ns}.json`);
    i18n.addResourceBundle(lang, ns, mod.default, true, true);
  } catch {
    if (i18n.language !== DEFAULT_LNG) {
      try {
        const mod = await import(`./locales/${DEFAULT_LNG}/${ns}.json`);
        i18n.addResourceBundle(DEFAULT_LNG, ns, mod.default, true, true);
      } catch {
        /* namespace 不存在时静默忽略 */
      }
    }
  }
}
export default i18n;
