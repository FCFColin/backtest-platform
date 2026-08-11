import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const tokensPath = join(
  __dirname,
  '..',
  '..',
  '..',
  'packages',
  'frontend',
  'src',
  'styles',
  'tokens.css',
);
const tokensContent = readFileSync(tokensPath, 'utf-8');

const tailwindConfigPath = join(__dirname, '..', '..', '..', 'tailwind.config.cjs');
const tailwindConfigContent = readFileSync(tailwindConfigPath, 'utf-8');

describe('tokens.css P0-2 CSS 变量', () => {
  describe('亮色主题（:root）', () => {
    it.each([
      ['表面层扩展变量', ['--surface-sunken:']],
      ['chart-tooltip-bg', ['--chart-tooltip-bg:']],
    ])('%s', (_name, vars) => {
      for (const v of vars) expect(tokensContent).toMatch(new RegExp(v.replace(':', '\\:')));
    });

    it('包含图表专用配色 chart-1 到 chart-8', () => {
      for (let i = 1; i <= 8; i++) {
        expect(tokensContent).toMatch(new RegExp(`--chart-${i}:`));
      }
    });
  });

  describe('暗色主题（.dark / [data-theme="dark"]）', () => {
    const darkBlock = () => tokensContent.match(/:root\[data-theme='dark'\]\s*\{[\s\S]*?\}/)?.[0];

    it('暗色主题块包含表面层扩展变量', () => {
      expect(darkBlock()).toBeTruthy();
      expect(darkBlock()!).toMatch(/--surface-sunken:/);
    });

    it('暗色主题品牌色微调为 214 100% 60%', () => {
      expect(darkBlock()).toBeTruthy();
      expect(darkBlock()!).toMatch(/--brand:\s*214\s+100%\s+60%/);
    });

    it('暗色主题包含 chart-1 到 chart-8', () => {
      expect(darkBlock()).toBeTruthy();
      for (let i = 1; i <= 8; i++) {
        expect(darkBlock()!).toMatch(new RegExp(`--chart-${i}:`));
      }
    });
  });
});

describe('tailwind.config.cjs P0-2 colors 映射', () => {
  it.each([
    ['surface-sunken', /'surface-sunken':\s*'hsl\(var\(--surface-sunken\)\)'/],
    ['brand-subtle 复用 --brand', /subtle:\s*'hsl\(var\(--brand\)/],
    ['success-subtle 复用 --success', /'success-subtle':\s*'hsl\(var\(--success\)/],
    ['warning-subtle 复用 --warning', /'warning-subtle':\s*'hsl\(var\(--warning\)/],
    ['sticky-bg 复用 --surface', /'sticky-bg':\s*'hsl\(var\(--surface\)/],
  ])('%s 映射存在', (_name, re) => {
    expect(tailwindConfigContent).toMatch(re);
  });

  it('包含 chart-1 到 chart-8 映射', () => {
    for (let i = 1; i <= 8; i++) {
      expect(tailwindConfigContent).toMatch(new RegExp(`'chart-${i}'`));
    }
  });
});

describe('tailwind.config.cjs P0-1 fontSize 阶梯', () => {
  it.each([
    ['display-xl 44px', /'display-xl':\s*\['44px'/],
    ['display-xl 字重 800', /fontWeight:\s*'800'/],
    ['label-tiny 11px', /'label-tiny':\s*\['11px'/],
    ['label-tiny letterSpacing 0.06em', /letterSpacing:\s*'0.06em'/],
    ['micro 10px', /micro:\s*\['10px'/],
    ['spacing 15 60px', /(?:'15'|15)\s*:\s*'3\.75rem'/],
    ['display 字重 700', /display:\s*\['32px'[^}]*fontWeight:\s*'700'/],
    ['h1 字重 700', /h1:\s*\['24px'[^}]*fontWeight:\s*'700'/],
  ])('%s', (_name, re) => {
    expect(tailwindConfigContent).toMatch(re);
  });
});
