import { vi } from 'vitest';

export const t = (key: string, params?: Record<string, unknown>) =>
  params ? key.replace(/\{\{(\w+)\}\}/g, (_, k) => String(params[k] ?? '')) : key;

export const i18nMock = {
  useTranslation: () => ({ t, i18n: { language: 'zh-CN', changeLanguage: vi.fn() } }),
  Trans: ({ i18nKey }: { i18nKey: string }) => i18nKey,
};
