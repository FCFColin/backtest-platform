/**
 * OpenAPI 契约测试（T-E1 升级）
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const openapiPath = path.resolve(__dirname, '../../docs/openapi.yaml');

function extractPaths(yaml: string): Set<string> {
  const paths = new Set<string>();
  const re = /^ {2}(\/[^\s:]+):/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(yaml)) !== null) {
    paths.add(m[1]);
  }
  return paths;
}

describe('OpenAPI 契约测试', () => {
  const content = fs.readFileSync(openapiPath, 'utf-8');
  const paths = extractPaths(content);

  it('openapi.yaml 应存在且定义 ≥20 个 path', () => {
    expect(fs.existsSync(openapiPath)).toBe(true);
    expect(paths.size).toBeGreaterThanOrEqual(20);
  });

  const requiredPaths = [
    '/auth/login',
    '/auth/refresh',
    '/auth/logout',
    '/auth/me',
    '/backtest/portfolio',
    '/backtest/monte-carlo',
    '/backtest/search',
    '/data/history',
    '/data/search',
    '/health',
    '/ready',
    '/metrics',
    '/tactical/backtest',
    '/signal/dual',
    '/pca/analyze',
    '/letf/analyze',
    '/goal-optimizer/optimize',
    '/backtest-optimizer/optimize',
    '/admin/stats',
    '/data/manage/status',
  ];

  it.each(requiredPaths)('应定义 path %s', (p) => {
    expect(paths.has(p) || content.includes(`  ${p}:`)).toBe(true);
  });

  it('应包含 BearerAuth 与 ProblemDetail', () => {
    expect(content).toContain('BearerAuth');
    expect(content).toContain('ProblemDetail');
    expect(content).toContain('IdempotencyKey');
  });

  it('认证描述应提及 JWT', () => {
    expect(content).toMatch(/JWT|Bearer|REQUIRE_API_KEY/);
  });
});
