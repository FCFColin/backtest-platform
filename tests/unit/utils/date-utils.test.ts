import { describe, it, expect } from 'vitest';
import { isValidDate } from '../../../packages/backend/src/utils/misc.js';

describe('isValidDate', () => {
  describe('合法输入', () => {
    it.each([
      ['2024-01-01', '年初'],
      ['2024-12-31', '年末'],
      ['2024-02-29', '闰日'],
      ['1999-06-15', '历史日期'],
      ['2099-12-31', '未来日期'],
    ])('应接受 %s（%s）', (value) => {
      expect(isValidDate(value)).toBe(true);
    });

    it('应接受空字符串（业务约定：表示不限制）', () => {
      expect(isValidDate('')).toBe(true);
    });
  });

  describe('非法格式', () => {
    it.each([
      ['2024/01/01', '斜杠分隔', false],
      ['24-01-01', '两位年份', false],
      ['2024-1-01', '一位月份', false],
      ['2024-01-1', '一位日期', false],
      ['2024-13-01', '月份越界（语义校验）', false],
      ['2024-01-32', '日期越界（语义校验）', false],
      ['20240101', '无分隔符', false],
      ['2024-01', '缺少日期', false],
      ['2024', '只有年份', false],
      ['abcd-ef-gh', '非数字', false],
      ['2024-01-01T00:00:00Z', 'ISO 时间', false],
      [' 2024-01-01', '前导空格', false],
      ['2024-01-01 ', '尾随空格', false],
    ])('%s 格式判定：%s', (value, _desc, expected) => {
      expect(isValidDate(value)).toBe(expected);
    });
  });

  describe('边界与异常输入', () => {
    // 注：isValidDate 实现中 `if (!value) return true`，
    // null/undefined 为 falsy，被视为"空字符串"（表示不限制），返回 true。
    it('null 应返回 true（falsy 视为空，表示不限制）', () => {
      expect(isValidDate(null as unknown as string)).toBe(true);
    });

    it('undefined 应返回 true（falsy 视为空，表示不限制）', () => {
      expect(isValidDate(undefined as unknown as string)).toBe(true);
    });

    it('数字类型应返回 false（不匹配正则）', () => {
      expect(isValidDate(20240101 as unknown as string)).toBe(false);
    });

    it('对象类型应返回 false（不匹配正则）', () => {
      expect(isValidDate({} as unknown as string)).toBe(false);
    });
  });
});
