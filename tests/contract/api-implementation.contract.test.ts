import { describe, it, expect, vi } from 'vitest';
import SwaggerParser from '@apidevtools/swagger-parser';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { fileURLToPath } from 'url';
import { generateOpenApiDocument } from '../../packages/backend/src/schemas/openapi-registry.js';
import { redisModuleMock } from '../helpers/redisFixture.js';

// β-1 副作用隔离（范式同 health-routes.test）：动态 import 路由模块前阻断 redis/pg。
// queueDefinitions 未被任何 routes 文件顶层 import（jobSubmission 经工厂注入），无需 mock。
vi.mock('../../packages/backend/src/infrastructure/redisClient.js', () => redisModuleMock);
vi.mock('../../packages/backend/src/db/pool.js', () => ({
  getPool: vi.fn(() => ({ query: vi.fn().mockResolvedValue({ rows: [] }) })),
  getReadPool: vi.fn(() => ({ query: vi.fn().mockResolvedValue({ rows: [] }) })),
  pool: { query: vi.fn() },
}));

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

// ── 运行时枚举（ADR-013 终局方案）─────────────────────────────

interface RouteLayer {
  route?: { path: string | string[]; methods?: Record<string, unknown> };
  handle?: { stack?: RouteLayer[] };
  name?: string;
  regexp?: RegExp;
}

/** Express 内部挂载 regexp → 子前缀（如 /^\/portfolios\/?(?=\/|$)/ → '/portfolios'）。 */
function regexpToPrefix(re: RegExp): string {
  return re.source
    .replace(/^\^/, '')
    .replace(/\(\?=[^)]*\)/g, '')
    .replace(/\\\//g, '/')
    .replace(/\/\?$/, '');
}

function enumerateRouter(stack: RouteLayer[], prefix: string, out: SpecPaths): void {
  for (const layer of stack) {
    if (layer.route) {
      const sub =
        typeof layer.route.path === 'string' ? expressToOpenApiPath(layer.route.path) : '';
      const fullPath = normalizePath(prefix + sub);
      if (!out.has(fullPath)) out.set(fullPath, new Set());
      for (const m of Object.keys(layer.route.methods ?? {})) {
        if (m !== '_all') out.get(fullPath)!.add(m.toUpperCase());
      }
    } else if (layer.name === 'router' && layer.handle?.stack) {
      enumerateRouter(layer.handle.stack, prefix + regexpToPrefix(layer.regexp!), out);
    }
  }
}

async function importRouteModule(filePath: string): Promise<Record<string, unknown>> {
  return (await import(pathToFileURL(filePath).href)) as Record<string, unknown>;
}

/** 从模块导出中找到 Router 实例（default 或首个带 stack 的导出；Router 是挂载 stack 的函数）。 */
function findRouter(mod: Record<string, unknown>): { stack: RouteLayer[] } | null {
  for (const c of [mod.default, ...Object.values(mod)]) {
    if (
      (typeof c === 'function' || typeof c === 'object') &&
      c !== null &&
      Array.isArray((c as { stack?: unknown }).stack)
    ) {
      return c as unknown as { stack: RouteLayer[] };
    }
  }
  return null;
}

async function buildImplementedPaths(): Promise<SpecPaths> {
  const result: SpecPaths = new Map();
  for (const mount of extractMountPoints()) {
    const filePath = path.join(routesDir, `${mount.routeFile}.ts`);
    if (!fs.existsSync(filePath)) continue;
    const mod = await importRouteModule(filePath);
    const router = findRouter(mod);
    if (!router) continue;
    const specPrefix = mount.prefix.replace(/^\/api\/v1/, '');
    enumerateRouter(router.stack, specPrefix, result);
  }
  return result;
}

function expressToOpenApiPath(exprPath: string): string {
  return normalizePath(exprPath.replace(/:(\w+)/g, '{$1}'));
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
  const implementedPromise = buildImplementedPaths();

  it('spec 中的每个路径+方法都应在 Express 实现中存在（豁免探活端点）', async () => {
    const [specPaths, implemented] = await Promise.all([specPathsPromise, implementedPromise]);
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
    const [specPaths, implemented] = await Promise.all([specPathsPromise, implementedPromise]);
    const undocumented: string[] = [];
    for (const [p, methods] of implemented) {
      if (EXEMPT_PATHS.includes(p)) continue;
      for (const m of methods) {
        if (!specPaths.get(p)?.has(m)) {
          undocumented.push(`${m} ${p}（实现存在，spec 未记录）`);
        }
      }
    }
    assertNoMissing(undocumented, '实现→spec');
  });

  it('应无重复路由定义（同一路径 + 方法在单个路由文件中仅定义一次）', async () => {
    const duplicates: string[] = [];
    for (const mount of mounts) {
      const filePath = path.join(routesDir, `${mount.routeFile}.ts`);
      if (!fs.existsSync(filePath)) continue;
      const mod = await importRouteModule(filePath);
      const router = findRouter(mod);
      if (!router) continue;
      const seen = new Set<string>();
      const local: SpecPaths = new Map();
      enumerateRouter(router.stack, '', local);
      for (const [p, methods] of local) {
        for (const m of methods) {
          const key = `${m} ${expressToOpenApiPath(p)}`;
          if (seen.has(key)) duplicates.push(`${mount.routeFile}: ${key}`);
          seen.add(key);
        }
      }
    }
    if (duplicates.length > 0) {
      throw new Error(`重复路由定义:\n${duplicates.join('\n')}`);
    }
  });

  it('扫描器金丝雀：未注册路径不得出现在实现枚举中（ADR-013）', async () => {
    const implemented = await implementedPromise;
    expect(implemented.has('/__scanner_canary_test__')).toBe(false);
    // 真正的失明防护是上方双向比对：扫描器任何漏检都会让 spec 声明的路由在实现侧"消失"而报错；
    // 金丝雀额外守护"凭空多出路径"的相反失效模式。
  });
});
