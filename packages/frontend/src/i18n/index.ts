import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import commonZh from './locales/zh-CN/common.json';
import commonEn from './locales/en/common.json';
import accountZh from './locales/zh-CN/account.json';
import adminZh from './locales/zh-CN/admin.json';
import analysisZh from './locales/zh-CN/analysis.json';
import authZh from './locales/zh-CN/auth.json';
import backtestZh from './locales/zh-CN/backtest.json';
import legalZh from './locales/zh-CN/legal.json';
import pagesZh from './locales/zh-CN/pages.json';
import accountEn from './locales/en/account.json';
import adminEn from './locales/en/admin.json';
import analysisEn from './locales/en/analysis.json';
import authEn from './locales/en/auth.json';
import backtestEn from './locales/en/backtest.json';
import legalEn from './locales/en/legal.json';
import pagesEn from './locales/en/pages.json';
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
    // 全量注册（静态 import 内联打包）：按需动态 import(`./locales/${lang}/${ns}.json`)
    // 在生产构建无法解析，导致 key 未翻译
    resources: {
      'zh-CN': {
        common: commonZh,
        account: accountZh,
        admin: adminZh,
        analysis: analysisZh,
        auth: authZh,
        backtest: backtestZh,
        legal: legalZh,
        pages: pagesZh,
      },
      en: {
        common: commonEn,
        account: accountEn,
        admin: adminEn,
        analysis: analysisEn,
        auth: authEn,
        backtest: backtestEn,
        legal: legalEn,
        pages: pagesEn,
      },
    },
    fallbackLng: DEFAULT_LNG,
    supportedLngs: [...SUPPORTED_LNGS],
    // t('auth.xxx') 等调用未显式指定 ns（useTranslation() 默认 common），
    // fallbackNS 让 key 在所有已注册 ns 中查找（修复 ns 拆分后 key 未翻译）
    fallbackNS: ['account', 'admin', 'analysis', 'auth', 'backtest', 'legal', 'pages'],
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
      })() ?? (typeof navigator !== 'undefined' ? navigator.language : DEFAULT_LNG),
    ),
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage'],
    },
    react: {
      useSuspense: true,
    },
  });
// 资源已全量注册（init resources），此处为兼容旧调用点保留的 no-op
export async function loadNamespace(_ns: string): Promise<void> {}
export default i18n;
