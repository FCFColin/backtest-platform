/**
 * i18n 初始化配置
 * 支持中文（zh-CN）和英文（en）
 *
 * 两种语言均静态打包，避免英文用户首屏先渲染中文再切换（中英混杂闪烁）。
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import zhCN from '../../../../public/locales/zh-CN/translation.json';
import en from '../../../../public/locales/en/translation.json';

const DEFAULT_LNG = 'zh-CN';
const SUPPORTED_LNGS = ['zh-CN', 'en'] as const;

/** 将浏览器/存储中的语言代码规范化为受支持的语言 */
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
      'zh-CN': { translation: zhCN },
      en: { translation: en },
    },
    fallbackLng: DEFAULT_LNG,
    supportedLngs: [...SUPPORTED_LNGS],
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
      convertDetectedLanguage: normalizeLng,
    },
  });

export default i18n;
