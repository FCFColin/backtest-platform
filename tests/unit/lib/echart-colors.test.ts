import { describe, it, expect } from 'vitest';
import { resolveVarColorToken } from '../../../packages/frontend/src/utils/format';

const resolve = (name: string): string => {
  switch (name) {
    case '--chart-1':
      return 'hsl(217 91% 53%)';
    case '--fg-tertiary':
      return 'hsl(217 20% 45%)';
    case '--tooltip-shadow':
      return '0 10px 30px -5px rgba(0, 0, 0, 0.25)';
    default:
      return '';
  }
};

describe('resolveVarColorToken', () => {
  it('解析 hsl(var(--x)) 为具体 hsl 色值（外层 hsl() 整体消费，不产生嵌套）', () => {
    expect(resolveVarColorToken('hsl(var(--chart-1))', resolve)).toBe('hsl(217 91% 53%)');
  });

  it('hsl() 包裹的 token 不产生二次包裹', () => {
    expect(resolveVarColorToken('hsl(var(--fg-tertiary))', resolve)).toBe('hsl(217 20% 45%)');
  });

  it('非颜色值 var(--x)（如 box-shadow）原样透传', () => {
    const input = 'box-shadow: var(--tooltip-shadow);';
    expect(resolveVarColorToken(input, resolve)).toBe(
      'box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.25);',
    );
  });

  it('未定义的 token 保留原样', () => {
    expect(resolveVarColorToken('hsl(var(--chart-9))', resolve)).toBe('hsl(var(--chart-9))');
  });
});
