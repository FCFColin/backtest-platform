import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const NS = ['common', 'backtest'] as const;
const LANGS = ['zh-CN'] as const;

const modules = import.meta.glob('./locales/*/*.json', { eager: true }) as Record<
  string,
  { default: unknown }
>;
const resources: Record<string, Record<string, Record<string, string>>> = {};
for (const [path, mod] of Object.entries(modules)) {
  const m = path.match(/\/locales\/([^/]+)\/([^/]+)\.json$/);
  if (m) (resources[m[1]] ??= {})[m[2]] = mod.default as Record<string, string>;
}

const DEFAULT_LNG = 'zh-CN';
const SUPPORTED_LNGS = [...LANGS];

function normalizeLng(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_LNG;
  return raw.startsWith('zh') ? 'zh-CN' : DEFAULT_LNG;
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'zh-CN',
    supportedLngs: SUPPORTED_LNGS,
    fallbackNS: NS.filter((n) => n !== 'common'),
    ns: ['common'],
    defaultNS: 'common',
    partialBundledLanguages: true,
    lng: normalizeLng(
      (() => {
        try {
          return localStorage.getItem('i18nextLng');
        } catch {
          return null;
        }
      })() ?? (typeof navigator !== 'undefined' ? navigator.language : DEFAULT_LNG),
    ),
    interpolation: { escapeValue: false },
    keySeparator: false,
    nsSeparator: ':',
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage'],
    },
    react: { useSuspense: true },
  });

export async function loadNamespace(_ns: string): Promise<void> {}
export default i18n;
