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

type SpecPaths = Map<string, Set<string>>;

function normalizePath(p: string): string {
  if (p.length > 1 && p.endsWith('/')) return p.slice(0, -1);
  return p;
}

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

/** 解析文件内 `import xxx from '...'` 的相对模块路径。 */
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

  // 匹配 router.get('/path', ...), router.post('/path', ...), 等
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

/**
 * tenantCrudRoutes 工厂（routeUtils.ts）生成的标准租户 CRUD 路径：
 * GET /、POST /、GET /{id}、DELETE /{id}，以及（service 提供 update 时）PUT /{id}。
 * 静态扫描无法看到工厂内部 router 调用，这里按工厂契约补充。
 *
 * @param content - 路由文件内容
 * @param specPrefix - 挂载前缀（去掉 /api/v1 后）
 * @returns 工厂生成的路径
 */
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
  const mounts = extractMountPoints();
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
