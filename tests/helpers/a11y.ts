import { expect, type Page, type Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export async function expectA11y(
  page: Page,
  options?: {
    scope?: Locator;
    rules?: string[];
  },
) {
  const builder = new AxeBuilder({ page });

  if (options?.scope) {
    builder.include(options.scope);
  }

  if (options?.rules) {
    builder.disableRules(options.rules);
  }

  const { violations } = await builder.analyze();
  expect(violations.length).toBe(0);
}
