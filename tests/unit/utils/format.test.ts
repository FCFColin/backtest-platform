import { describe, it, expect } from 'vitest';
import {
  fmtDate,
  fmtYears,
  fmtPct,
  fmtRatio,
  fmtNum,
  fmtDollar,
} from '../../../packages/frontend/src/utils/format.js';

describe('fmtDate', () => {
  it('undefined 应返回占位符', () => {
    expect(fmtDate()).toBe('—');
  });

  it('空字符串应返回占位符', () => {
    expect(fmtDate('')).toBe('—');
  });

  it('有效日期字符串应原样返回', () => {
    expect(fmtDate('2024-01-15')).toBe('2024-01-15');
  });
});

describe('fmtYears', () => {
  it('null 应返回占位符', () => {
    expect(fmtYears(null)).toBe('—');
  });

  it('undefined 应返回占位符', () => {
    expect(fmtYears(undefined)).toBe('—');
  });

  it('NaN 应返回占位符', () => {
    expect(fmtYears(NaN)).toBe('—');
  });

  it('零值应格式化', () => {
    expect(fmtYears(0)).toBe('0.00y');
  });

  it('正值应保留两位小数', () => {
    expect(fmtYears(5.5)).toBe('5.50y');
  });

  it('负值应正确格式化', () => {
    expect(fmtYears(-1.234)).toBe('-1.23y');
  });
});

describe('fmtPct', () => {
  it('null 应返回占位符', () => {
    expect(fmtPct(null)).toBe('—');
  });

  it('undefined 应返回占位符', () => {
    expect(fmtPct(undefined)).toBe('—');
  });

  it('NaN 应返回占位符', () => {
    expect(fmtPct(NaN)).toBe('—');
  });

  it('零值应格式化', () => {
    expect(fmtPct(0)).toBe('0.00%');
  });

  it('小数应转为百分比', () => {
    expect(fmtPct(0.0523)).toBe('5.23%');
  });

  it('负值应正确格式化', () => {
    expect(fmtPct(-0.1)).toBe('-10.00%');
  });

  it('1 应为 100%', () => {
    expect(fmtPct(1)).toBe('100.00%');
  });
});

describe('fmtRatio', () => {
  it('null 应返回占位符', () => {
    expect(fmtRatio(null)).toBe('—');
  });

  it('undefined 应返回占位符', () => {
    expect(fmtRatio(undefined)).toBe('—');
  });

  it('NaN 应返回占位符', () => {
    expect(fmtRatio(NaN)).toBe('—');
  });

  it('零值应格式化', () => {
    expect(fmtRatio(0)).toBe('0.00');
  });

  it('正值应保留两位小数', () => {
    expect(fmtRatio(1.5)).toBe('1.50');
  });

  it('三位小数应四舍五入', () => {
    expect(fmtRatio(3.456)).toBe('3.46');
  });
});

describe('fmtNum', () => {
  it('null / undefined / NaN 应返回占位符', () => {
    expect(fmtNum(null)).toBe('—');
    expect(fmtNum(undefined)).toBe('—');
    expect(fmtNum(NaN)).toBe('—');
  });

  it('应支持自定义小数位数并四舍五入', () => {
    expect(fmtNum(0)).toBe('0.00');
    expect(fmtNum(1.236, 2)).toBe('1.24');
    expect(fmtNum(1.5, 0)).toBe('2');
  });
});

describe('fmtDollar', () => {
  it('应格式化为美元（无小数，带千分位）', () => {
    expect(fmtDollar(1234)).toBe('$1,234');
  });

  it('零值应返回 $0', () => {
    expect(fmtDollar(0)).toBe('$0');
  });
});
