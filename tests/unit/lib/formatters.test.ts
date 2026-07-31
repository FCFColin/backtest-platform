import { describe, it, expect, vi } from 'vitest';

vi.mock('@/i18n/index.js', () => ({
  default: {
    t: (key: string, options?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'format.durationDays': '{count}天',
        'format.durationMonthShort': '{count}个月',
        'format.durationYearsShort': '{count}年',
      };
      const template = map[key] || key;
      if (options) {
        let result = template;
        for (const [k, v] of Object.entries(options)) {
          result = result.replace(`{${k}}`, String(v));
        }
        return result;
      }
      return template;
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
    it('小金额显示 2 位小数', () => {
      expect(formatCurrency(1234.56)).toContain('1,234.56');
    });

    it('大金额（≥100万）0 位小数', () => {
      const result = formatCurrency(1_500_000);
      expect(result).toContain('1,500,000');
      expect(result).not.toContain('1,500,000.00');
    });

    it('负值正确显示', () => {
      expect(formatCurrency(-500)).toContain('500');
    });

    it('零值正确显示', () => {
      const result = formatCurrency(0);
      expect(result).toContain('0.00');
    });
  });

  describe('formatPercent', () => {
    it('默认 2 位小数', () => {
      expect(formatPercent(0.123456)).toBe('12.35%');
    });

    it('自定义小数位数', () => {
      expect(formatPercent(0.123456, 1)).toBe('12.3%');
    });

    it('零值', () => {
      expect(formatPercent(0)).toBe('0.00%');
    });

    it('负值', () => {
      expect(formatPercent(-0.055)).toBe('-5.50%');
    });
  });

  describe('formatDuration', () => {
    it('小于 30 天显示天', () => {
      expect(formatDuration(15)).toBe('15天');
    });

    it('30-365 天显示月', () => {
      expect(formatDuration(60)).toContain('月');
    });

    it('≥365 天显示年', () => {
      expect(formatDuration(730)).toBe('2.0年');
    });

    it('刚好 365 天', () => {
      expect(formatDuration(365)).toBe('1.0年');
    });
  });

  describe('formatNumber', () => {
    it('默认 2 位小数', () => {
      expect(formatNumber(3.14159)).toBe('3.14');
    });

    it('自定义小数位数', () => {
      expect(formatNumber(3.14159, 4)).toBe('3.1416');
    });
  });

  describe('formatPercentSigned', () => {
    it('正值加 + 号', () => {
      expect(formatPercentSigned(0.055)).toBe('+5.50%');
    });

    it('负值保持 - 号', () => {
      expect(formatPercentSigned(-0.032)).toBe('-3.20%');
    });

    it('零值加 + 号', () => {
      expect(formatPercentSigned(0)).toBe('+0.00%');
    });
  });
});
