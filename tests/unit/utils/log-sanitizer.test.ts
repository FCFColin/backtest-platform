import { describe, it, expect } from 'vitest';
import { sanitizeLog } from '../../../packages/backend/src/utils/logger.js';

describe('sanitizeLog - 移除换行符', () => {
  it.each([
    ['\\n', 'line1\nline2', 'line1line2'],
    ['\\r', 'line1\rline2', 'line1line2'],
    ['\\r\\n', 'line1\r\nline2', 'line1line2'],
    ['多个连续', 'a\n\n\nb', 'ab'],
    ['开头', '\nfoo', 'foo'],
    ['结尾', 'foo\n', 'foo'],
  ])('应移除 %s 换行符', (_n, input, expected) => {
    expect(sanitizeLog(input)).toBe(expected);
  });

  it('日志注入攻击向量应被中和', () => {
    const sanitized = sanitizeLog('normal\n2024-01-01 [ERROR] fake log entry');
    expect(sanitized).toBe('normal2024-01-01 [ERROR] fake log entry');
    expect(sanitized.includes('\n')).toBe(false);
  });
});

describe('sanitizeLog - 截断到 50 字符', () => {
  it.each([
    ['超过 50', 'a'.repeat(100), 'a'.repeat(50)],
    ['恰好 50', 'b'.repeat(50), 'b'.repeat(50)],
    ['少于 50', 'short', 'short'],
  ])('应处理 %s 字符的输入', (_n, input, expected) => {
    expect(sanitizeLog(input)).toBe(expected);
  });

  it('截断应在移除换行符之后', () => {
    expect(sanitizeLog('a\n'.repeat(30))).toBe('a'.repeat(30));
  });

  it('移除换行符后仍超长时应截断', () => {
    expect(sanitizeLog('x\n' + 'y'.repeat(60))).toBe('x' + 'y'.repeat(49));
  });
});

describe('sanitizeLog - 边界与异常输入', () => {
  it.each([
    ['空字符串', '', ''],
    ['单字符', 'a', 'a'],
    ['只含换行符', '\n\r\n', ''],
    ['中文字符 50 个', '中'.repeat(50), '中'.repeat(50)],
  ])('应处理 %s', (_n, input, expected) => {
    expect(sanitizeLog(input)).toBe(expected);
  });
});