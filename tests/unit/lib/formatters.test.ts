import { describe, it, expect, vi } from 'vitest';

vi.mock('@/i18n/index.js', () => ({
  default: {
    t: (key: string, options?: Record<string, unknown>) => {
      if (options) {
        let result = key;
        for (const [k, v] of Object.entries(options)) {
          result = result.replace(`{{${k}}}`, String(v));
        }
        return result;
      }
      return key;
    },
    language: 'zh-CN',
  },
}));

import {
  formatCurrency,
  formatPercent,
  formatDuration,
  formatNumber,
  formatPercentSigned,
} from '../../../packages/frontend/src/utils/format.js';

describe('formatters', () => {
  describe('formatCurrency', () => {
    it.each([
      [1234.56, '1,234.56'],
      [-500, '500'],
      [0, '0.00'],
    ])('formatCurrency(%p) 应包含 %p', (input, expected) => {
      expect(formatCurrency(input)).toContain(expected);
    });

    it('大金额（≥100万）0 位小数', () => {
      const result = formatCurrency(1_500_000);
      expect(result).toContain('1,500,000');
      expect(result).not.toContain('1,500,000.00');
    });
  });

  describe('formatPercent', () => {
    it.each([
      [0.123456, 2, '12.35%'],
      [0.123456, 1, '12.3%'],
      [0, 2, '0.00%'],
      [-0.055, 2, '-5.50%'],
    ])('formatPercent(%p, %p) 应为 %p', (value, digits, expected) => {
      expect(formatPercent(value, digits)).toBe(expected);
    });
  });

  describe('formatDuration', () => {
    it.each([
      [15, '15 days'],
      [60, '2mo'],
      [730, '2.0y'],
      [365, '1.0y'],
    ])('formatDuration(%p) 应为 %p', (days, expected) => {
      expect(formatDuration(days)).toBe(expected);
    });
  });

  describe('formatNumber', () => {
    it.each([
      [3.14159, 2, '3.14'],
      [3.14159, 4, '3.1416'],
    ])('formatNumber(%p, %p) 应为 %p', (value, digits, expected) => {
      expect(formatNumber(value, digits)).toBe(expected);
    });
  });

  describe('formatPercentSigned', () => {
    it.each([
      [0.055, '+5.50%'],
      [-0.032, '-3.20%'],
      [0, '+0.00%'],
    ])('formatPercentSigned(%p) 应为 %p', (input, expected) => {
      expect(formatPercentSigned(input)).toBe(expected);
    });
  });
});
