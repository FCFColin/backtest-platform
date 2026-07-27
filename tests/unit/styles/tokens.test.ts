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
    it('包含表面层扩展变量', () => {
      expect(tokensContent).toMatch(/--surface-raised:/);
      expect(tokensContent).toMatch(/--surface-sunken:/);
    });

    it('包含品牌色 subtle/glow 变体', () => {
      expect(tokensContent).toMatch(/--brand-subtle:/);
      expect(tokensContent).toMatch(/--brand-glow:/);
    });

    it('包含语义色 subtle 变体', () => {
      expect(tokensContent).toMatch(/--success-subtle:/);
      expect(tokensContent).toMatch(/--warning-subtle:/);
      expect(tokensContent).toMatch(/--danger-subtle:/);
      expect(tokensContent).toMatch(/--info-subtle:/);
    });

    it('包含图表专用配色 chart-1 到 chart-8', () => {
      for (let i = 1; i <= 8; i++) {
        expect(tokensContent).toMatch(new RegExp(`--chart-${i}:`));
      }
    });

    it('包含 chart-grid 和 chart-tooltip-bg', () => {
      expect(tokensContent).toMatch(/--chart-grid:/);
      expect(tokensContent).toMatch(/--chart-tooltip-bg:/);
    });

    it('包含 sticky-bg', () => {
      expect(tokensContent).toMatch(/--sticky-bg:/);
    });
  });

  describe('暗色主题（.dark / [data-theme="dark"]）', () => {
    it('暗色主题块包含表面层扩展变量', () => {
      const darkBlock = tokensContent.match(/\.dark\s*\{[\s\S]*?\}/);
      expect(darkBlock).toBeTruthy();
      expect(darkBlock![0]).toMatch(/--surface-raised:/);
      expect(darkBlock![0]).toMatch(/--surface-sunken:/);
    });

    it('暗色主题品牌色微调为 214 100% 60%', () => {
      const darkBlock = tokensContent.match(/\.dark\s*\{[\s\S]*?\}/);
      expect(darkBlock).toBeTruthy();
      expect(darkBlock![0]).toMatch(/--brand:\s*214\s+100%\s+60%/);
    });

    it('暗色主题包含 chart-1 到 chart-8', () => {
      const darkBlock = tokensContent.match(/\.dark\s*\{[\s\S]*?\}/);
      expect(darkBlock).toBeTruthy();
      for (let i = 1; i <= 8; i++) {
        expect(darkBlock![0]).toMatch(new RegExp(`--chart-${i}:`));
      }
    });

    it('暗色主题包含 sticky-bg', () => {
      const darkBlock = tokensContent.match(/\.dark\s*\{[\s\S]*?\}/);
      expect(darkBlock).toBeTruthy();
      expect(darkBlock![0]).toMatch(/--sticky-bg:/);
    });
  });
});

describe('tailwind.config.cjs P0-2 colors 映射', () => {
  it('包含 surface-raised 和 surface-sunken 映射', () => {
    expect(tailwindConfigContent).toMatch(/'surface-raised':\s*'hsl\(var\(--surface-raised\)\)'/);
    expect(tailwindConfigContent).toMatch(/'surface-sunken':\s*'hsl\(var\(--surface-sunken\)\)'/);
  });

  it('包含 brand-subtle 和 brand-glow 映射', () => {
    expect(tailwindConfigContent).toMatch(/subtle:\s*'hsl\(var\(--brand-subtle\)/);
    expect(tailwindConfigContent).toMatch(/glow:\s*'hsl\(var\(--brand-glow\)/);
  });

  it('包含语义色 subtle 映射', () => {
    expect(tailwindConfigContent).toMatch(/'success-subtle'/);
    expect(tailwindConfigContent).toMatch(/'danger-subtle'/);
    expect(tailwindConfigContent).toMatch(/'warning-subtle'/);
    expect(tailwindConfigContent).toMatch(/'info-subtle'/);
  });

  it('包含 chart-1 到 chart-8 映射', () => {
    for (let i = 1; i <= 8; i++) {
      expect(tailwindConfigContent).toMatch(new RegExp(`'chart-${i}'`));
    }
  });

  it('包含 chart-grid 和 sticky-bg 映射', () => {
    expect(tailwindConfigContent).toMatch(/'chart-grid'/);
    expect(tailwindConfigContent).toMatch(/'sticky-bg'/);
  });
});

describe('tailwind.config.cjs P0-1 fontSize 阶梯', () => {
  it('包含 display-xl (44px)', () => {
    expect(tailwindConfigContent).toMatch(/'display-xl':\s*\['44px'/);
  });

  it('display-xl 字重为 800', () => {
    expect(tailwindConfigContent).toMatch(/fontWeight:\s*'800'/);
  });

  it('包含 label-tiny (11px)', () => {
    expect(tailwindConfigContent).toMatch(/'label-tiny':\s*\['11px'/);
  });

  it('label-tiny letterSpacing 为 0.06em', () => {
    expect(tailwindConfigContent).toMatch(/letterSpacing:\s*'0.06em'/);
  });

  it('包含 micro (10px)', () => {
    expect(tailwindConfigContent).toMatch(/micro:\s*\['10px'/);
  });

  it('包含 spacing 15 (60px)', () => {
    expect(tailwindConfigContent).toMatch(/'15':\s*'3\.75rem'/);
  });

  it('display 字重为 700', () => {
    expect(tailwindConfigContent).toMatch(/display:\s*\['32px'[^}]*fontWeight:\s*'700'/);
  });

  it('h1 字重为 700', () => {
    expect(tailwindConfigContent).toMatch(/h1:\s*\['24px'[^}]*fontWeight:\s*'700'/);
  });
});
