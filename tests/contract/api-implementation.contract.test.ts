import { describe, it } from 'vitest';
import SwaggerParser from '@apidevtools/swagger-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateOpenApiDocument } from '../../packages/backend/src/schemas/openapi-paths.js';

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

  // 匹配裸 router. 与命名路由（analysisRouter. 等）两种声明：
  // 可选前缀 + [Rr]outer 尾部（首个字符若被消费，裸 router 将无法命中）。
  const ROUTER = String.raw`\b(?:[A-Za-z_$][\w$]*)?[Rr]outer`;

  const routeRegex = new RegExp(
    `(${ROUTER})\\.(get|post|put|delete|patch)\\(\\s*['"\`]([^'"\`]+)['"\`]`,
    'g',
  );
  let match: RegExpExecArray | null;
  while ((match = routeRegex.exec(content)) !== null) {
    routes.push({ method: match[2].toUpperCase(), path: match[3] });
  }

  const chainRegex = new RegExp(
    `(${ROUTER})\\.route\\(\\s*['"\`]([^'"\`]+)['"\`]\\s*\\)([^;]+)`,
    'g',
  );
  while ((match = chainRegex.exec(content)) !== null) {
    const routePath = match[2];
    const chain = match[3];
    const methodRegex = /\.(get|post|put|delete|patch)\(/g;
    let m: RegExpExecArray | null;
    while ((m = methodRegex.exec(chain)) !== null) {
      routes.push({ method: m[1].toUpperCase(), path: routePath });
    }
  }

  const useRegex = new RegExp(`(${ROUTER})\\.use\\(\\s*(\\w+Routes)\\s*\\)`, 'g');
  while ((match = useRegex.exec(content)) !== null) {
    const subPath = resolveImportPath(filePath, match[2]);
    if (subPath) {
      routes.push(...extractRoutesFromFile(subPath, seen));
    }
  }

  // 辅助函数注册（registerSignalRoute(mode, '/signal/analyze', schema)）：路径为字符串字面量参数。
  const helperRegex = /registerSignalRoute\(\s*'\w+'\s*,\s*'([^']+)'\s*,/g;
  while ((match = helperRegex.exec(content)) !== null) {
    routes.push({ method: 'POST', path: match[1] });
  }

  return routes;
}

function expressToOpenApiPath(exprPath: string): string {
  return normalizePath(exprPath.replace(/:(\w+)/g, '{$1}'));
}

// tenantCrudRoutes 合成路径：按 router.use('子路径', ...)/crudMount('子路径', ...) 块推导真实
// 子前缀与 update 支持，而非凭空生成 '/' 与 '/{id}'（后者在非根挂载下产生不存在的假路径）。
function factoryRoutesFromFile(
  content: string,
  specPrefix: string,
): Array<{ method: string; path: string }> {
  if (!content.includes('tenantCrudRoutes(')) return [];
  const routes: Array<{ method: string; path: string }> = [];
  const blockRegex = /(?:router\.use|crudMount)\(\s*['"`]([^'"`]+)['"`][\s\S]*?\)\s*;/g;
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(content)) !== null) {
    const base = normalizePath(specPrefix + match[1]);
    const hasUpdate = /\bupdate\s*:/.test(match[0]);
    routes.push(
      { method: 'GET', path: base },
      { method: 'POST', path: base },
      { method: 'GET', path: `${base}/{id}` },
      { method: 'DELETE', path: `${base}/{id}` },
    );
    if (hasUpdate) routes.push({ method: 'PUT', path: `${base}/{id}` });
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

// 挂载在 /api（非 /api/v1）的探活端点，spec 以 /health /ready /metrics 登记，双向豁免。
const EXEMPT_PATHS = ['/health', '/ready', '/metrics'];

const mounts = extractMountPoints();

const assertNoMissing = (missing: string[], label: string): void => {
  if (missing.length > 0) {
    throw new Error(`${label} ${missing.length} 个缺口:\n${missing.join('\n')}`);
  }
};

describe('OpenAPI 契约测试 — API 实现一致性（D5-009）', () => {
  const specPathsPromise = extractSpecPaths();
  const implementedPaths = buildImplementedPaths();

  it('spec 中的每个路径+方法都应在 Express 实现中存在（豁免探活端点）', async () => {
    const specPaths = await specPathsPromise;
    const implemented = new Map([...implementedPaths].map(([p, m]) => [p, new Set([...m])]));
    const missing: string[] = [];
    for (const [p, methods] of specPaths) {
      if (EXEMPT_PATHS.includes(p)) continue;
      for (const m of methods) {
        if (!implemented.get(p)?.has(m)) {
          missing.push(`${m} ${p}（spec 有定义，实现中未找到）`);
        }
      }
    }
    assertNoMissing(missing, 'spec→实现');
  });

  it('Express 实现中的每个路径+方法都应在 spec 中有记录（豁免探活端点）', async () => {
    const specPaths = await specPathsPromise;
    const undocumented: string[] = [];
    for (const [p, methods] of implementedPaths) {
      if (EXEMPT_PATHS.includes(p)) continue;
      for (const m of methods) {
        if (!specPaths.get(p)?.has(m)) {
          undocumented.push(`${m} ${p}（实现存在，spec 未记录）`);
        }
      }
    }
    assertNoMissing(undocumented, '实现→spec');
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
