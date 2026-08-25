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

// D-5b 运行时 key 采样：经 postProcessor 拦截——useTranslation 的 fixedT 克隆
// 不经过 i18n.t 属性，直接包装会采到 0 条（实测踩坑 @第4会话）。
// 启用面：DEV 构建，或 VITE_I18N_SAMPLING=1 的采样专用产物（D-5 流程用，
// 平时生产构建不含采样器，避免键名可枚举面）。
const i18nSamplingOn = import.meta.env.DEV || import.meta.env.VITE_I18N_SAMPLING === '1';
if (i18nSamplingOn) {
  const usedKeySet = new Set<string>();
  i18n.use({
    type: 'postProcessor',
    name: 'devKeySampler',
    process: (value: string, key: unknown) => {
      const k = Array.isArray(key) ? key[0] : key;
      if (typeof k === 'string') usedKeySet.add(k);
      return value;
    },
  });
  (globalThis as unknown as Record<string, unknown>).__i18nUsedKeys = usedKeySet;
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
  ...(i18nSamplingOn ? { postProcess: ['devKeySampler'] } : {}),
});

export default i18n;
