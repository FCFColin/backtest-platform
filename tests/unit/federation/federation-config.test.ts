/**
 * Federation 配置冒烟测试（P3-02 / ADR-050）。
 *
 * 企业理由：ADR-050 将 OptimizerPage / SignalAnalyzerPage 作为 Module Federation
 * exposes 暴露，配置写错（包名 / host 名 / exposes 路径）会导致未来 remote 消费失败。
 * 冒烟测试验证：
 *   1. vite.config.ts 注册了 backtest_host federation 并暴露两个预期 key；
 *   2. exposes 指向的源文件确实存在。
 *
 * 实现说明：不直接动态 import vite.config.ts——其静态 import
 * '@originjs/vite-plugin-federation' 在 pnpm install 前不可解析，会导致模块加载失败。
 * 改以文本断言 + 文件存在性检查，覆盖配置正确性而不耦合该依赖的安装状态。
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const viteConfigText = fs.readFileSync(path.resolve(repoRoot, 'vite.config.ts'), 'utf8');

describe('federation config (ADR-050)', () => {
  it('vite.config.ts 注册 backtest_host federation 并暴露 OptimizerPage / SignalAnalyzerPage', () => {
    expect(viteConfigText).toContain('@originjs/vite-plugin-federation');
    expect(viteConfigText).toContain("name: 'backtest_host'");
    expect(viteConfigText).toMatch(/'\.\/OptimizerPage'[\s\S]*?'\.\/SignalAnalyzerPage'/);
  });

  it('exposes 指向的页面源文件存在', () => {
    const optimizerPage = path.resolve(
      repoRoot,
      'packages/frontend/src/pages/optimizer/OptimizerPage.tsx',
    );
    const signalAnalyzerPage = path.resolve(
      repoRoot,
      'packages/frontend/src/pages/signal/SignalAnalyzerPage.tsx',
    );
    expect(fs.existsSync(optimizerPage) && fs.existsSync(signalAnalyzerPage)).toBe(true);
  });
});
