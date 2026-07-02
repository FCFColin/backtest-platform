/**
 * logSanitizer 单元测试
 *
 * 企业理由：日志注入是 OWASP Top 10 中的安全风险，攻击者通过换行符
 * 可伪造日志条目绕过审计。测试覆盖：
 * - 移除换行符（\n、\r）
 * - 截断到 50 字符
 * - 边界（空串、超长、无换行）
 */

import { describe, it, expect } from 'vitest';
import { sanitizeLog } from '../../../api/utils/logSanitizer.js';

describe('sanitizeLog', () => {
  describe('移除换行符', () => {
    it('应移除 \\n 换行符', () => {
      expect(sanitizeLog('line1\nline2')).toBe('line1line2');
    });

    it('应移除 \\r 换行符', () => {
      expect(sanitizeLog('line1\rline2')).toBe('line1line2');
    });

    it('应移除 \\r\\n 换行符', () => {
      expect(sanitizeLog('line1\r\nline2')).toBe('line1line2');
    });

    it('应移除多个连续换行符', () => {
      expect(sanitizeLog('a\n\n\nb')).toBe('ab');
    });

    it('应移除开头换行符', () => {
      expect(sanitizeLog('\nfoo')).toBe('foo');
    });

    it('应移除结尾换行符', () => {
      expect(sanitizeLog('foo\n')).toBe('foo');
    });

    it('日志注入攻击向量应被中和', () => {
      // 攻击者尝试伪造日志条目
      const malicious = 'normal\n2024-01-01 [ERROR] fake log entry';
      const sanitized = sanitizeLog(malicious);
      expect(sanitized).toBe('normal2024-01-01 [ERROR] fake log entry');
      // 净化后单行，无法伪造新日志条目
      expect(sanitized.includes('\n')).toBe(false);
    });
  });

  describe('截断到 50 字符', () => {
    it('应截断超过 50 字符的输入', () => {
      const long = 'a'.repeat(100);
      expect(sanitizeLog(long)).toBe('a'.repeat(50));
    });

    it('应保留恰好 50 字符的输入', () => {
      const exact = 'b'.repeat(50);
      expect(sanitizeLog(exact)).toBe(exact);
    });

    it('应保留少于 50 字符的输入', () => {
      expect(sanitizeLog('short')).toBe('short');
    });

    it('截断应在移除换行符之后', () => {
      // 移除换行符后长度变化，再截断到 50
      const input = 'a\n'.repeat(30); // 60 字符，移除换行后 30 个 a
      expect(sanitizeLog(input)).toBe('a'.repeat(30));
    });

    it('移除换行符后仍超长时应截断', () => {
      const input = 'x\n' + 'y'.repeat(60); // 移除 \n 后 61 字符
      expect(sanitizeLog(input)).toBe('x' + 'y'.repeat(49));
    });
  });

  describe('边界与异常输入', () => {
    it('应接受空字符串', () => {
      expect(sanitizeLog('')).toBe('');
    });

    it('应处理单字符输入', () => {
      expect(sanitizeLog('a')).toBe('a');
    });

    it('应处理只含换行符的输入', () => {
      expect(sanitizeLog('\n\r\n')).toBe('');
    });

    it('应处理中文字符（不截断中文字符宽度）', () => {
      const chinese = '中'.repeat(50);
      expect(sanitizeLog(chinese)).toBe(chinese);
    });
  });
});
