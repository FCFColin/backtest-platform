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

// D-5b 运行时 key 采样（DEV 门控，不进生产 bundle）：e2e 跑完后读
// window.__i18nUsedKeys 导出 used-keys 快照，与静态采样做三重过滤差集
if (import.meta.env.DEV) {
  const usedKeySet = new Set<string>();
  const origT = i18n.t.bind(i18n);
  i18n.t = ((key: string | string[], ...args: unknown[]) => {
    const k = Array.isArray(key) ? key[0] : key;
    if (typeof k === 'string') usedKeySet.add(k);
    return (origT as typeof i18n.t)(key as string, ...args);
  }) as typeof i18n.t;
  (window as unknown as Record<string, unknown>).__i18nUsedKeys = usedKeySet;
}

export default i18n;
