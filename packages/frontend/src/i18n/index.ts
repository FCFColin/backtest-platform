import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const modules = import.meta.glob('./locales/*/*.json', { eager: true }) as Record<
  string,
  { default: unknown }
>;
const resources: Record<string, Record<string, Record<string, string>>> = {};
for (const [path, mod] of Object.entries(modules)) {
  const m = path.match(/\/locales\/([^/]+)\/([^/]+)\.json$/);
  if (m) (resources[m[1]] ??= {})[m[2]] = mod.default as Record<string, string>;
}

i18n.use(initReactI18next).init({
  resources,
  fallbackLng: 'zh-CN',
  supportedLngs: ['zh-CN'],
  ns: ['common'],
  defaultNS: 'common',
  partialBundledLanguages: true,
  lng: 'zh-CN',
  interpolation: { escapeValue: false },
  keySeparator: false,
  nsSeparator: ':',
  react: { useSuspense: true },
});

export default i18n;
