// scripts/verify/H-zod-coverage.mjs
// H-zod-coverage: 验证所有 POST/PUT/PATCH 路由均有 Zod validate 中间件
// P1-2-B: 15 个路由补 Zod 验证的覆盖率守门脚本
//
// 扫描 packages/backend/src/routes/*.ts，对每个 router.post/put/patch 调用
// 检查 middleware 链中是否包含 validate( 调用。缺少验证的路由将被报告。
import { writeResult, readFileContent } from './_lib.mjs';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROUTES_REL_DIR = 'packages/backend/src/routes';
const ROUTES_ABS_DIR = join(process.cwd(), ROUTES_REL_DIR);

/** 非路由文件（工具/类型，不含 router 声明） */
const NON_ROUTE_FILES = new Set(['routeUtils.ts']);

/**
 * 列出 routes 目录下所有 .ts 路由文件
 * @returns {string[]}
 */
function listRouteFiles() {
  if (!existsSync(ROUTES_ABS_DIR)) return [];
  return readdirSync(ROUTES_ABS_DIR)
    .filter((f) => f.endsWith('.ts') && !NON_ROUTE_FILES.has(f))
    .sort();
}

/**
 * 从 router.(post|put|patch)( 起始位置提取路径参数（字符串字面量或变量名）
 * @param {string} content - 文件全文
 * @param {number} callStart - router.xxx( 的起始下标
 * @returns {string} 路径描述（如 '/refresh' 或 'path' 或 '<unknown>'）
 */
function extractPath(content, callStart) {
  const afterParen = content.slice(callStart);
  const m = afterParen.match(/\(\s*(['"`])([^'"`]*?)\1/) || afterParen.match(/\(\s*([A-Za-z_]\w*)/);
  return m ? (m[2] ?? m[1] ?? '<unknown>') : '<unknown>';
}

/**
 * 扫描单个文件，找出所有缺少 validate() 的 POST/PUT/PATCH 路由
 * @param {string} fileName
 * @returns {{method: string, path: string, line: number, file: string}[]}
 */
function findUnvalidatedRoutes(fileName) {
  const content = readFileContent(join(ROUTES_REL_DIR, fileName));
  const routeRegex = /router\.(post|put|patch)\s*\(/g;
  const missing = [];
  let m;
  while ((m = routeRegex.exec(content)) !== null) {
    const method = m[1].toUpperCase();
    const callStart = m.index;
    const nextRouterIdx = content.indexOf('router.', callStart + m[0].length);
    const windowEnd = nextRouterIdx > 0 ? nextRouterIdx : Math.min(content.length, callStart + 4000);
    const window = content.slice(callStart, windowEnd);
    if (!/validate\s*\(/.test(window)) {
      const path = extractPath(content, callStart);
      const line = content.slice(0, callStart).split('\n').length;
      missing.push({ method, path, line, file: fileName });
    }
  }
  return missing;
}

const result = (() => {
  const files = listRouteFiles();
  if (files.length === 0) {
    return {
      status: 'FAIL',
      summary: `routes 目录为空或不存在: ${ROUTES_REL_DIR}`,
      details: { routesDir: ROUTES_REL_DIR, fileCount: 0 },
    };
  }

  const allMissing = [];
  const perFile = {};
  let totalRoutes = 0;
  let validatedRoutes = 0;

  for (const f of files) {
    const missing = findUnvalidatedRoutes(f);
    const content = readFileContent(join(ROUTES_REL_DIR, f));
    const routeCount = (content.match(/router\.(post|put|patch)\s*\(/g) || []).length;
    totalRoutes += routeCount;
    validatedRoutes += routeCount - missing.length;
    perFile[f] = { total: routeCount, missing: missing.length, missingRoutes: missing };
    allMissing.push(...missing);
  }

  const allValidated = allMissing.length === 0;
  const coveragePct = totalRoutes > 0 ? ((validatedRoutes / totalRoutes) * 100).toFixed(1) : '0.0';

  return {
    status: allValidated ? 'PASS' : 'FAIL',
    summary: allValidated
      ? `all POST/PUT/PATCH have Zod validation (${validatedRoutes}/${totalRoutes} routes, ${coveragePct}%)`
      : `${allMissing.length} POST/PUT/PATCH route(s) missing Zod validation (${validatedRoutes}/${totalRoutes} validated, ${coveragePct}%)`,
    details: {
      routesDir: ROUTES_REL_DIR,
      filesScanned: files.length,
      totalRoutes,
      validatedRoutes,
      missingCount: allMissing.length,
      coveragePct: `${coveragePct}%`,
      missingRoutes: allMissing,
      perFile,
    },
  };
})();

writeResult('H-zod-coverage', result);
process.exit(result.status === 'PASS' ? 0 : 1);
