/**
 * @vitest-environment happy-dom
 *
 * LayoutStability 回归测试（C-006 CLS 修复）。
 *
 * 企业理由：首页 `/` 渲染 BacktestPage。原先使用 React.lazy + Suspense，
 * fallback（小 spinner ~150px）→ 真实内容（~800px+）切换导致实测 CLS=0.7788
 * （阈值 < 0.1）。根因：PerformanceObserver 在 startTime=1410ms 捕获到 <main>
 * 高度从 452px 突变为 835px（懒加载 chunk 解析后内容替换 fallback）。
 *
 * 修复方案：
 *   1. 首屏 BacktestPage 改为 eager import（不走 Suspense，消除 fallback→内容切换）
 *   2. ToolRoutes Suspense fallback 预留 minHeight（为其他懒加载路由消除偏移）
 *
 * 本测试为结构不变量守卫，防止回归：
 *   - BacktestPage 不得重新被 React.lazy 包装
 *   - ToolRoutes fallback 必须预留垂直空间（minHeight）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const routesPath = resolve(process.cwd(), 'packages/frontend/src/routes/index.tsx');
const routesSource = readFileSync(routesPath, 'utf-8');

describe('C-006 Layout Stability — 首屏 eager import + fallback 预留高度', () => {
  it('BacktestPage（首屏 `/`）不得使用 React.lazy 包装', () => {
    // 首屏组件必须 eager import，避免 Suspense fallback → 真实内容高度突变导致 CLS
    expect(routesSource).not.toMatch(
      /lazy\s*\(\s*\(\)\s*=>\s*import\([^)]*BacktestPage/,
    );
  });

  it('BacktestPage 必须以静态 import 语句直接引入', () => {
    expect(routesSource).toMatch(/import\s+BacktestPage\s+from\s+['"][^'"]*BacktestPage/);
  });

  it('ToolRoutes Suspense fallback 必须预留 minHeight 以消除布局偏移', () => {
    // fallback 预留高度，避免懒加载路由内容替换时高度突变
    expect(routesSource).toMatch(/minHeight/);
  });

  it('PromoBar 同步读取 dismiss 状态（不在渲染后消失导致 CLS）', () => {
    const promoSource = readFileSync(
      resolve(process.cwd(), 'packages/frontend/src/components/layout/PromoBar.tsx'),
      'utf-8',
    );
    // useState 初始化器中同步读 localStorage，避免先渲染再消失
    expect(promoSource).toMatch(/localStorage\.getItem/);
    expect(promoSource).toMatch(/useState/);
  });
});
