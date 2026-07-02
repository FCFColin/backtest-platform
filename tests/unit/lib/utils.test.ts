/**
 * src/lib/utils.ts — cn() 工具函数测试
 */
import { describe, it, expect } from 'vitest';
import { cn } from '../../../src/lib/utils.js';

describe('cn', () => {
  it('应合并多个 className', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1');
  });

  it('Tailwind 冲突时应由 twMerge 保留后者', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('条件 class 应正确处理 falsy', () => {
    const show = false as boolean;
    expect(cn('base', show && 'hidden', undefined, 'text-sm')).toBe('base text-sm');
  });

  it('空输入应返回空字符串', () => {
    expect(cn()).toBe('');
  });
});
