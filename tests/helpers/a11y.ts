import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// 图表密集页基线噪声（region 缺 landmark / color-contrast 主题色带非 WCAG AA 目标）项目级禁用；需全量检查的页面显式传 disable: []
export async function expectA11y(page: Page, options: { scope?: string; disable?: string[] } = {}) {
  const builder = new AxeBuilder({ page });
  builder.disableRules(options.disable ?? ['region', 'color-contrast']);
  if (options.scope) builder.include(options.scope);
  const { violations } = await builder.analyze();
  expect(violations.length).toBe(0);
}
