import { describe, it, expect } from 'vitest';
import SwaggerParser from '@apidevtools/swagger-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateOpenApiDocument } from '../../packages/backend/src/schemas/openapi-registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appSrcPath = path.resolve(__dirname, '../../packages/backend/src/app.ts');
const routesDir = path.resolve(__dirname, '../../packages/backend/src/routes');

type SpecPaths = Map<string, Set<string>>;

function normalizePath(p: string): string {
  if (p.length > 1 && p.endsWith('/')) return p.slice(0, -1);
  return p;
}

async function extractSpecPaths(): Promise<SpecPaths> {
  const doc = (await SwaggerParser.validate(generateOpenApiDocument() as never)) as {
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

interface MountPoint {
  prefix: string;
  routeFile: string;
}

function extractMountPoints(): MountPoint[] {
  const content = fs.readFileSync(appSrcPath, 'utf8');
  const mounts: MountPoint[] = [];

  const mountRegex = /app\.use\(\s*['"`]([^'"`]+)['"`]\s*,([^;]+)\);/g;
  let match: RegExpExecArray | null;
  while ((match = mountRegex.exec(content)) !== null) {
    const prefix = match[1];
    if (!prefix.startsWith('/api/v1')) continue;

    const args = match[2];
    const routeModules = args.match(/\b(\w+Routes)\b/g);
    if (routeModules && routeModules.length > 0) {
      mounts.push({ prefix, routeFile: routeModules[routeModules.length - 1] });
    }
  }
  return mounts;
}

function resolveImportPath(filePath: string, localName: string): string | null {
  const content = fs.readFileSync(filePath, 'utf8');
  const importRegex = new RegExp(`import\\s+${localName}\\s+from\\s+['"]([^'"]+)['"]`);
  const m = importRegex.exec(content);
  if (!m) return null;
  const spec = m[1];
  if (!spec.startsWith('.')) return null;
  return path.resolve(path.dirname(filePath), `${spec}.ts`);
}

function extractRoutesFromFile(
  filePath: string,
  seen = new Set<string>(),
): Array<{ method: string; path: string }> {
  if (!fs.existsSync(filePath) || seen.has(filePath)) return [];
  seen.add(filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  const routes: Array<{ method: string; path: string }> = [];

  const routeRegex = /\brouter\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/g;
  let match: RegExpExecArray | null;
  while ((match = routeRegex.exec(content)) !== null) {
    routes.push({ method: match[1].toUpperCase(), path: match[2] });
  }

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

  const useRegex = /\brouter\.use\(\s*(\w+Routes)\s*\)/g;
  while ((match = useRegex.exec(content)) !== null) {
    const subPath = resolveImportPath(filePath, match[1]);
    if (subPath) {
      routes.push(...extractRoutesFromFile(subPath, seen));
    }
  }

  return routes;
}

function expressToOpenApiPath(exprPath: string): string {
  return normalizePath(exprPath.replace(/:(\w+)/g, '{$1}'));
}

function factoryRoutesFromFile(
  content: string,
  specPrefix: string,
): Array<{ method: string; path: string }> {
  if (!content.includes('tenantCrudRoutes(')) return [];
  const routes: Array<{ method: string; path: string }> = [
    { method: 'GET', path: specPrefix },
    { method: 'POST', path: specPrefix },
    { method: 'GET', path: `${specPrefix}/{id}` },
    { method: 'DELETE', path: `${specPrefix}/{id}` },
  ];
  if (/\bupdate\s*:/.test(content)) {
    routes.push({ method: 'PUT', path: `${specPrefix}/{id}` });
  }
  return routes;
}

function buildImplementedPaths(): SpecPaths {
  const result: SpecPaths = new Map();
  const add = (fullPath: string, method: string): void => {
    if (!result.has(fullPath)) {
      result.set(fullPath, new Set());
    }
    result.get(fullPath)!.add(method);
  };

  for (const mount of mounts) {
    const specPrefix = mount.prefix.replace(/^\/api\/v1/, '');
    const filePath = path.join(routesDir, `${mount.routeFile}.ts`);

    const routes = extractRoutesFromFile(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    for (const route of routes) {
      add(expressToOpenApiPath(specPrefix + route.path), route.method);
    }
    for (const route of factoryRoutesFromFile(content, specPrefix)) {
      add(normalizePath(route.path), route.method);
    }
  }

  return result;
}

const EXEMPT_PREFIXES = ['/health', '/ready', '/metrics'];

const mounts = extractMountPoints();

const assertCoverage = (covered: number, required: number, label: string, missing: string[]) => {
  if (covered >= required) return;
  throw new Error(
    `${label} ${(covered * 100).toFixed(1)}% < ${required * 100}%，缺失:\n${missing.slice(0, 15).join('\n')}`,
  );
};

describe('OpenAPI 契约测试 — API 实现一致性（D5-009）', () => {
  const specPathsPromise = extractSpecPaths();
  const implementedPaths = buildImplementedPaths();

  it('应从 app.ts 提取 ≥12 个路由挂载点（ADR-042 合并挂载后实际 12 个）', () => {
    expect(mounts.length).toBeGreaterThanOrEqual(12);
  });

  it('应从路由文件提取 ≥40 个实现路径', () => {
    expect(implementedPaths.size).toBeGreaterThanOrEqual(40);
  });

  it('spec 中 ≥60% 的路径应在 Express 实现中存在', async () => {
    const specPaths = await specPathsPromise;
    const implemented = new Set(implementedPaths.keys());
    const missingPaths = [...specPaths.keys()].filter((p) => !implemented.has(p));
    assertCoverage(
      (specPaths.size - missingPaths.length) / specPaths.size,
      0.6,
      'spec 路径实现覆盖率',
      missingPaths,
    );
  });

  it('Express 实现的路径 ≥60% 应在 spec 中有记录（豁免 /health /ready /metrics）', async () => {
    const specPaths = await specPathsPromise;
    const nonExempt = [...implementedPaths.keys()].filter(
      (p) => !EXEMPT_PREFIXES.some((ep) => p.startsWith(ep)),
    );
    const undocumented = nonExempt.filter((p) => !specPaths.has(p));
    assertCoverage(
      (nonExempt.length - undocumented.length) / nonExempt.length,
      0.6,
      '实现路径 spec 覆盖率',
      undocumented,
    );
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
    const duplicates: string[] = [];
    for (const mount of mounts) {
      const seen = new Set<string>();
      for (const r of extractRoutesFromFile(path.join(routesDir, `${mount.routeFile}.ts`))) {
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
