import { describe, it, expect } from 'vitest';
import {
  INPUT_WIDTHS,
  CARD_WIDTHS,
  CARD_GRID_CLASSES,
  CONTAINER_WIDTHS,
} from '../../../packages/frontend/src/utils/constants.js';

describe('INPUT_WIDTHS', () => {
  it('包含所有必需的输入宽度键', () => {
    const expectedKeys = [
      'ticker',
      'weight',
      'percent',
      'currency',
      'currencyLong',
      'date',
      'integer',
      'ratio',
      'select',
      'selectShort',
      'search',
    ];
    for (const key of expectedKeys) {
      expect(INPUT_WIDTHS).toHaveProperty(key);
    }
  });

  it('每个值都是有效的 Tailwind 宽度类', () => {
    for (const value of Object.values(INPUT_WIDTHS)) {
      expect(value).toMatch(/^w-\[\d+px\]$/);
    }
  });

  it.each([
    ['ticker', 'w-[220px]'],
    ['weight', 'w-[100px]'],
    ['search', 'w-[320px]'],
  ])('%s 宽度为 %s', (key, cls) => {
    expect((INPUT_WIDTHS as Record<string, string>)[key]).toBe(cls);
  });
});

describe('CARD_WIDTHS', () => {
  it('包含所有必需的卡片宽度键', () => {
    const expectedKeys = ['portfolio', 'cashflow', 'saved', 'metric', 'hero'];
    for (const key of expectedKeys) {
      expect(CARD_WIDTHS).toHaveProperty(key);
    }
  });

  it('每个卡片宽度包含 min/max 属性', () => {
    for (const value of Object.values(CARD_WIDTHS)) {
      expect(value).toHaveProperty('min');
      expect(value).toHaveProperty('max');
      expect(value.min).toBeLessThanOrEqual(value.max);
    }
  });

  it('portfolio 卡片宽度范围为 320-460px', () => {
    expect(CARD_WIDTHS.portfolio.min).toBe(320);
    expect(CARD_WIDTHS.portfolio.max).toBe(460);
  });
});

describe('CARD_GRID_CLASSES', () => {
  it('包含所有必需的 Grid 类键', () => {
    const expectedKeys = ['portfolio', 'cashflow', 'saved', 'metric', 'hero'];
    for (const key of expectedKeys) {
      expect(CARD_GRID_CLASSES).toHaveProperty(key);
    }
  });

  it('每个值包含 grid 和 gap 类', () => {
    for (const value of Object.values(CARD_GRID_CLASSES)) {
      expect(value).toContain('grid');
      expect(value).toMatch(/gap-\d/);
    }
  });

  it('portfolio Grid 使用 auto-fill minmax(320px,1fr)', () => {
    expect(CARD_GRID_CLASSES.portfolio).toContain('auto-fill');
    expect(CARD_GRID_CLASSES.portfolio).toContain('minmax(320px,1fr)');
  });
});

describe('CONTAINER_WIDTHS', () => {
  it('包含所有必需的容器宽度键', () => {
    const expectedKeys = ['page', 'content', 'narrow', 'form'];
    for (const key of expectedKeys) {
      expect(CONTAINER_WIDTHS).toHaveProperty(key);
    }
  });

  it('每个值包含 max-w 和 mx-auto', () => {
    for (const value of Object.values(CONTAINER_WIDTHS)) {
      expect(value).toMatch(/max-w-\[/);
      expect(value).toContain('mx-auto');
    }
  });

  it.each(['max-w-[1440px]', 'px-6'])('page 容器应包含 %s', (cls) => {
    expect(CONTAINER_WIDTHS.page).toContain(cls);
  });
});
