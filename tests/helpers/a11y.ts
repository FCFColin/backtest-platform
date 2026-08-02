import { expect, type Page, type Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Check accessibility violations on the current page.
 * Throws an assertion error if any violation is found.
 *
 * @param page - Playwright Page instance
 * @param options - Optional configuration
 */
export async function expectA11y(
  page: Page,
  options?: {
    /** Restrict scan to a specific locator (e.g. page.locator('[data-region="main"]') */
    scope?: Locator;
    /** Exclude rules by tag name (e.g. ['color-contrast']) */
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
