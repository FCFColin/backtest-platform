import { describe, it, expect } from 'vitest';
import {
  INPUT_WIDTHS,
  CARD_GRID_CLASSES,
  CONTAINER_WIDTHS,
} from '../../../packages/frontend/src/utils/constants.js';

interface WidthSet {
  setName: string;
  set: Record<string, string>;
  keys: string[];
  valuePattern: RegExp;
  spot: Array<[string, string]>;
}

const WIDTH_SETS: WidthSet[] = [
  {
    setName: 'INPUT_WIDTHS',
    set: INPUT_WIDTHS,
    keys: [
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
    ],
    valuePattern: /^w-\[\d+px\]$/,
    spot: [
      ['ticker', 'w-[220px]'],
      ['weight', 'w-[100px]'],
      ['search', 'w-[320px]'],
    ],
  },
  {
    setName: 'CARD_GRID_CLASSES',
    set: CARD_GRID_CLASSES,
    keys: ['portfolio', 'cashflow', 'saved', 'metric', 'hero'],
    valuePattern: /grid.*gap-\d/,
    spot: [
      ['portfolio', 'auto-fill'],
      ['portfolio', 'minmax(320px,1fr)'],
    ],
  },
  {
    setName: 'CONTAINER_WIDTHS',
    set: CONTAINER_WIDTHS,
    keys: ['page', 'content', 'narrow', 'form'],
    valuePattern: /max-w-\[.*mx-auto/,
    spot: [
      ['page', 'max-w-[1440px]'],
      ['page', 'px-6'],
    ],
  },
];

describe('布局宽度 token', () => {
  it.each(WIDTH_SETS)('$setName 键完整', ({ set, keys }) => {
    for (const key of keys) expect(set).toHaveProperty(key);
  });
  it.each(WIDTH_SETS)('$setName 值格式合法', ({ set, valuePattern }) => {
    for (const value of Object.values(set)) expect(value).toMatch(valuePattern);
  });
  it.each(WIDTH_SETS)('$setName 关键值正确', ({ set, spot }) => {
    for (const [key, value] of spot) expect(set[key]).toContain(value);
  });
});

describe('布局 token 无伪类', () => {
  const pattern = /(^|\s)(hover:|focus:|active:|dark:)/;
  it.each([
    ['INPUT_WIDTHS', INPUT_WIDTHS],
    ['CARD_GRID_CLASSES', CARD_GRID_CLASSES],
    ['CONTAINER_WIDTHS', CONTAINER_WIDTHS],
  ])('%s 值不包含伪类', (name, set) => {
    for (const value of Object.values(set)) {
      expect(value, `[${name}] ${value}`).not.toMatch(pattern);
    }
  });
});
