import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const viteConfigText = fs.readFileSync(path.resolve(repoRoot, 'vite.config.ts'), 'utf8');

describe('federation config (DADR-050)', () => {
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
