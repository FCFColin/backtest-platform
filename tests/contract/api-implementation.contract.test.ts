/**
 * OpenAPI 契约测试 — API 实现一致性验证（D5-009）
 *
 * 企业理由：openapi.contract.test.ts 仅验证 spec 自身结构（$ref、responses、security），
 * 无法发现 "spec 定义了路径但 Express 未实现" 或 "Express 实现了路径但 spec 未记录" 的偏差。
 * 本测试通过静态分析 app.ts 路由挂载 + 路由文件中的 router.METHOD() 调用，
 * 提取实际实现的路径集合，与 OpenAPI spec 路径交叉比对。
 *
 * 覆盖：
 * 1. spec 路径子集实现覆盖（spec 中每个路径都应在 Express 中有对应路由）
 * 2. 实现路径子集 spec 覆盖（Express 路由应在 spec 中有记录，豁免 /health /ready /metrics）
 * 3. HTTP 方法一致性（spec 与实现的方法集合应匹配）
 */
import { describe, it, expect } from 'vitest';
import SwaggerParser from '@apidevtools/swagger-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const openapiPath = path.resolve(__dirname, '../../docs/openapi.yaml');
const appSrcPath = path.resolve(__dirname, '../../packages/backend/src/app.ts');
const routesDir = path.resolve(__dirname, '../../packages/backend/src/routes');

/** OpenAPI 路径 -> 方法集合 */
type SpecPaths = Map<string, Set<string>>;

/** 规范化路径：移除尾部斜杠（根路径 / 除外） */
function normalizePath(p: string): string {
  if (p.length > 1 && p.endsWith('/')) return p.slice(0, -1);
  return p;
}

/** 从 OpenAPI spec 提取所有路径 + 方法 */
async function extractSpecPaths(): Promise<SpecPaths> {
  const doc = (await SwaggerParser.validate(openapiPath)) as {
    paths: Record<string, Record<string, unknown> | undefined>;
  };
  const result: SpecPaths = new Map();
  for (const [p, pathItem] of Object.entries(doc.paths)) {
    if (!pathItem) continue;
    const methods = new Set<string>();
    for (const m of ['get', 'post', 'put', 'delete', 'patch']) {
      if (pathItem[m]) methods.add(m.toUpperCase());
    }
    if (methods.size > 0) result.set(normalizePath(p), methods);
  }
  return result;
}

/** 从 app.ts 提取路由挂载点：app.use('/api/v1/xxx', ..., routeModule); */
interface MountPoint {
  prefix: string;
  routeFile: string;
}

function extractMountPoints(): MountPoint[] {
  const content = fs.readFileSync(appSrcPath, 'utf8');
  const mounts: MountPoint[] = [];

  // 匹配整个 app.use('path', ...args); 语句（以分号结尾）
  const mountRegex = /app\.use\(\s*['"`]([^'"`]+)['"`]\s*,([^;]+)\);/g;
  let match: RegExpExecArray | null;
  while ((match = mountRegex.exec(content)) !== null) {
    const prefix = match[1];
    if (!prefix.startsWith('/api/v1')) continue;

    // 从参数列表中提取路由模块名（匹配 xxxRoutes 标识符）
    const args = match[2];
    const moduleMatch = args.match(/(\w+Routes)\s*\)?\s*$/);
    if (moduleMatch) {
      mounts.push({ prefix, routeFile: moduleMatch[1] });
    }
  }
  return mounts;
}

/** 从路由文件提取所有 router.METHOD('/path', ...) 调用 */
function extractRoutesFromFile(filePath: string): Array<{ method: string; path: string }> {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf8');
  const routes: Array<{ method: string; path: string }> = [];

  // 匹配 router.get('/path', ...), router.post('/path', ...), 等
  // 支持路径前有空格：router.get( '/path',
  const routeRegex = /\brouter\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/g;
  let match: RegExpExecArray | null;
  while ((match = routeRegex.exec(content)) !== null) {
    routes.push({ method: match[1].toUpperCase(), path: match[2] });
  }

  // 匹配 router.route('/path').get(...).post(...) 链式调用
  const chainRegex = /\brouter\.route\(\s*['"`]([^'"`]+)['"`]\s*\)([^;]+)/g;
  while ((match = chainRegex.exec(content)) !== null) {
    const routePath = match[1];
    const chain = match[2];
    const methodRegex = /\.(get|post|put|delete|patch)\(/g;
    let m: RegExpExecArray | null;
    while ((m = methodRegex.exec(chain)) !== null) {
      routes.push({ method: m[1].toUpperCase(), path: routePath });
    }
  }

  return routes;
}

/** 将 Express 路径参数 :id 转换为 OpenAPI 路径参数 {id} */
function expressToOpenApiPath(exprPath: string): string {
  return normalizePath(exprPath.replace(/:(\w+)/g, '{$1}'));
}

/** 合并挂载点前缀和路由路径，生成 OpenAPI 格式的完整路径 */
function buildImplementedPaths(): SpecPaths {
  const mounts = extractMountPoints();
  const result: SpecPaths = new Map();

  for (const mount of mounts) {
    const specPrefix = mount.prefix.replace(/^\/api\/v1/, '');
    const filePath = path.join(routesDir, `${mount.routeFile}.ts`);

    const routes = extractRoutesFromFile(filePath);
    for (const route of routes) {
      const fullPath = expressToOpenApiPath(specPrefix + route.path);
      if (!result.has(fullPath)) {
        result.set(fullPath, new Set());
      }
      result.get(fullPath)!.add(route.method);
    }
  }

  return result;
}

/** 豁免路径前缀（实现中存在但 spec 不需要记录的路径） */
const EXEMPT_PREFIXES = ['/health', '/ready', '/metrics'];

describe('OpenAPI 契约测试 — API 实现一致性（D5-009）', () => {
  const specPathsPromise = extractSpecPaths();
  const implementedPaths = buildImplementedPaths();

  it('应从 app.ts 提取 ≥15 个路由挂载点', () => {
    const mounts = extractMountPoints();
    expect(mounts.length).toBeGreaterThanOrEqual(15);
  });

  it('应从路由文件提取 ≥40 个实现路径', () => {
    expect(implementedPaths.size).toBeGreaterThanOrEqual(40);
  });

  it('spec 中 ≥60% 的路径应在 Express 实现中存在', async () => {
    const specPaths = await specPathsPromise;
    const implemented = new Set(implementedPaths.keys());
    let missing = 0;
    const missingPaths: string[] = [];
    for (const specPath of specPaths.keys()) {
      if (!implemented.has(specPath)) {
        missing++;
        missingPaths.push(specPath);
      }
    }
    const coverage = (specPaths.size - missing) / specPaths.size;
    if (coverage < 0.6) {
      throw new Error(
        `spec 路径实现覆盖率 ${(coverage * 100).toFixed(1)}% < 60%，缺失路径:\n${missingPaths.slice(0, 15).join('\n')}`,
      );
    }
  });

  it('Express 实现的路径 ≥60% 应在 spec 中有记录（豁免 /health /ready /metrics）', async () => {
    const specPaths = await specPathsPromise;
    let undocumented = 0;
    const undocumentedPaths: string[] = [];
    for (const implPath of implementedPaths.keys()) {
      if (EXEMPT_PREFIXES.some((p) => implPath.startsWith(p))) continue;
      if (!specPaths.has(implPath)) {
        undocumented++;
        undocumentedPaths.push(implPath);
      }
    }
    const nonExempt = Array.from(implementedPaths.keys()).filter(
      (p) => !EXEMPT_PREFIXES.some((ep) => p.startsWith(ep)),
    ).length;
    const coverage = (nonExempt - undocumented) / nonExempt;
    if (coverage < 0.6) {
      throw new Error(
        `实现路径 spec 覆盖率 ${(coverage * 100).toFixed(1)}% < 60%，未记录路径:\n${undocumentedPaths.slice(0, 15).join('\n')}`,
      );
    }
  });

  it('spec 与实现共有的路径，HTTP 方法应一致', async () => {
    const specPaths = await specPathsPromise;
    const mismatches: string[] = [];
    for (const [p, specMethods] of specPaths) {
      const implMethods = implementedPaths.get(p);
      if (!implMethods) continue;
      for (const m of specMethods) {
        if (!implMethods.has(m)) {
          mismatches.push(`${p}: spec 定义 ${m} 但实现中未找到`);
        }
      }
    }
    if (mismatches.length > 0) {
      throw new Error(`HTTP 方法不一致:\n${mismatches.slice(0, 10).join('\n')}`);
    }
  });

  it('应无重复路由定义（同一路径 + 方法在单个路由文件中仅定义一次）', () => {
    const mounts = extractMountPoints();
    const duplicates: string[] = [];
    for (const mount of mounts) {
      const filePath = path.join(routesDir, `${mount.routeFile}.ts`);
      const routes = extractRoutesFromFile(filePath);
      const seen = new Set<string>();
      for (const r of routes) {
        const key = `${r.method} ${r.path}`;
        if (seen.has(key)) {
          duplicates.push(`${mount.routeFile}: ${key}`);
        }
        seen.add(key);
      }
    }
    if (duplicates.length > 0) {
      throw new Error(`重复路由定义:\n${duplicates.join('\n')}`);
    }
  });
});