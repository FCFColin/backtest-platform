import { expect, type Page, type Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export async function expectA11y(
  page: Page,
  options?: {
    scope?: Locator;
    disable?: string[];
  },
) {
  const builder = new AxeBuilder({ page });

  if (options?.scope) {
    builder.include(options.scope);
  }

  if (options?.disable) {
    builder.disableRules(options.disable);
  }

  const { violations } = await builder.analyze();
  expect(violations.length).toBe(0);
}
