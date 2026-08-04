import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const routesPath = resolve(process.cwd(), 'packages/frontend/src/routes/index.tsx');
const routesSource = readFileSync(routesPath, 'utf-8');

describe('C-006 Layout Stability — lazy() + fallback 预留高度', () => {
  it('BacktestPage（首屏 `/`）使用 lazy() 懒加载', () => {
    expect(routesSource).toMatch(/lazy(?:Default)?\s*\(\s*\(\)\s*=>\s*import\([^)]*BacktestPage/);
  });

  it('Suspense fallback 必须预留 minHeight >= 70vh 以消除布局偏移', () => {
    const match = routesSource.match(/minHeight\s*:\s*['"](\d+)vh['"]|min-h-\[(\d+)vh\]/);
    expect(match).not.toBeNull();
    expect(Number(match![1] ?? match![2])).toBeGreaterThanOrEqual(70);
  });

  it('PromoBar 同步读取 dismiss 状态（不在渲染后消失导致 CLS）', () => {
    const promoSource = readFileSync(
      resolve(process.cwd(), 'packages/frontend/src/components/layout/navbarParts.tsx'),
      'utf-8',
    );
    expect(promoSource).toMatch(/localStorage\.getItem/);
    expect(promoSource).toMatch(/useState/);
  });
});
