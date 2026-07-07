/**
 * API 场景覆盖率检查
 *
 * 从 packages/backend/src/app.ts 提取所有注册的挂载点，递归读取各路由模块的子路由，
 * 组合为完整端点列表，然后搜索测试文件中是否包含对这些端点的 HTTP 调用。
 *
 * 使用：node scripts/check-api-coverage.mjs
 * 出口码：0 全覆盖 / 1 有遗漏
 */
import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Step 1: 已知路由挂载点（从 packages/backend/src/app.ts 提取，保持同步）
// ---------------------------------------------------------------------------

const MOUNTS = [
  { basePath: '/api', moduleName: 'healthRoutes' },
  { basePath: '/api/v1/billing/webhook', moduleName: 'inline', inline: true },
  { basePath: '/api/v1/data', moduleName: 'dataRoutes' },
  { basePath: '/api/v1/data/manage', moduleName: 'dataManageRoutes' },
  { basePath: '/api/v1/backtest', moduleName: 'backtestRoutes' },
  { basePath: '/api/v1/backtest-optimizer', moduleName: 'backtestOptimizerRoutes' },
  { basePath: '/api/v1/tactical', moduleName: 'tacticalRoutes' },
  { basePath: '/api/v1/pca', moduleName: 'pcaRoutes' },
  { basePath: '/api/v1/signal', moduleName: 'signalRoutes' },
  { basePath: '/api/v1/letf', moduleName: 'letfRoutes' },
  { basePath: '/api/v1/tactical-grid', moduleName: 'tacticalGridRoutes' },
  { basePath: '/api/v1/goal-optimizer', moduleName: 'goalOptimizerRoutes' },
  { basePath: '/api/v1/admin', moduleName: 'adminRoutes' },
  { basePath: '/api/v1/auth', moduleName: 'authRoutes' },
  { basePath: '/api/v1/keys', moduleName: 'apiKeyRoutes' },
  { basePath: '/api/v1/portfolios', moduleName: 'portfolioRoutes' },
  { basePath: '/api/v1/configs', moduleName: 'configRoutes' },
  { basePath: '/api/v1/runs', moduleName: 'runRoutes' },
  { basePath: '/api/v1/orgs', moduleName: 'orgRoutes' },
  { basePath: '/api/v1/billing', moduleName: 'billingRoutes' },
  { basePath: '/api/v1', moduleName: 'jobRoutes' },
  { basePath: '/api/v1', moduleName: 'debugRoutes' },
];

// ---------------------------------------------------------------------------
// Step 2: 从路由模块文件提取子路由
// ---------------------------------------------------------------------------

function parseSubroutes(source, basePath) {
  const re = /router\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]*)['"]/g;
  const routes = [];
  let m;
  while ((m = re.exec(source)) !== null) {
    const subPath = m[2];
    const full =
      subPath === '/' || subPath === ''
        ? basePath
        : basePath === '/'
          ? subPath
          : subPath.startsWith('/')
            ? basePath + subPath
            : basePath + '/' + subPath;
    routes.push({ method: m[1].toUpperCase(), subPath, fullPath: full });
  }
  return routes;
}

// ---------------------------------------------------------------------------
// Step 3: 收集所有端点
// ---------------------------------------------------------------------------

function collectEndpoints(mounts) {
  const endpoints = [];

  for (const mount of mounts) {
    if (mount.inline) {
      endpoints.push({ method: 'POST', fullPath: mount.basePath, file: 'packages/backend/src/app.ts' });
      continue;
    }

    const filePath = resolve(ROOT, 'packages/backend/src/routes', `${mount.moduleName}.ts`);
    if (!existsSync(filePath)) {
      // 有些路由模块可能在 packages/backend/src/ 根目录
      const altPath = resolve(ROOT, 'packages/backend/src', `${mount.moduleName}.ts`);
      if (existsSync(altPath)) {
        endpoints.push({ method: '*', fullPath: mount.basePath, file: altPath, note: 'fallback' });
      } else {
        endpoints.push({
          method: '*',
          fullPath: mount.basePath,
          file: 'unknown',
          note: 'not found',
        });
      }
      continue;
    }

    const source = readFileSync(filePath, 'utf-8');
    const subroutes = parseSubroutes(source, mount.basePath);

    if (subroutes.length === 0) {
      endpoints.push({
        method: '*',
        fullPath: mount.basePath,
        file: filePath,
        note: 'no subroutes',
      });
    } else {
      for (const sr of subroutes) {
        endpoints.push({ method: sr.method, fullPath: sr.fullPath, file: filePath });
      }
    }
  }

  return endpoints;
}

// ---------------------------------------------------------------------------
// Step 4: 搜索测试文件中的 HTTP 调用
// ---------------------------------------------------------------------------

function collectTestFiles(dir) {
  const files = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTestFiles(full));
    } else if (/\.test\.(ts|tsx|js)$/.test(entry.name) || /\.spec\.(ts|tsx|js)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function checkEndpointCoverage(endpoints) {
  const testDir = resolve(ROOT, 'tests');
  const testFiles = collectTestFiles(testDir);
  const covered = {};

  for (const ep of endpoints) {
    const key = `${ep.method}:${ep.fullPath}`;
    covered[key] = false;
  }

  // 搜索每个测试文件
  for (const tf of testFiles) {
    const content = readFileSync(tf, 'utf-8');

    for (const ep of endpoints) {
      const key = `${ep.method}:${ep.fullPath}`;
      if (covered[key]) continue;

      // 要检测的路径变体
      const pathVariants = [
        ep.fullPath,
        ep.fullPath.replace('/api/v1', '/api'), // legacy path
        ep.fullPath.replace('/api/v1', ''), // relative path
        ep.fullPath.replace(/\/:\w+/g, '/:id'), // generic param
        ep.fullPath.replace(/\/:\w+/g, '/${id}'), // template literal
      ];
      // 路由名检测（如 "search" 出现在 "/api/backtest/search" 中）
      let found = false;
      for (const variant of pathVariants) {
        if (variant && content.includes(variant)) {
          covered[key] = true;
          found = true;
          break;
        }
      }
      if (found) continue;

      // URL 模板字符串模式: `${...}/api/v1/xxx`
      // 检测 ${server.url}/api/xxx 或 ${API_BASE}/api/xxx 模式
      const tplPattern = new RegExp(
        `['"\`]\\$\\{[^}]+\\}${escapeRegex(ep.fullPath.replace(/\/:\w+/g, '/[^/"]+'))}['"\`]`,
      );
      if (tplPattern.test(content)) {
        covered[key] = true;
        continue;
      }

      // 检测 supertest/chai-http 模式: .get('/api/v1/xxx')
      const superRe = new RegExp(
        `\\.(?:get|post|put|delete|patch)\\s*\\(\\s*['"\`]${escapeRegex(ep.fullPath.replace(/\/:\w+/g, '/[^/"]+'))}['"\`]`,
      );
      if (superRe.test(content)) {
        covered[key] = true;
        continue;
      }
    }
  }

  return covered;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Step 5: 打印报告
// ---------------------------------------------------------------------------

function main() {
  const endpoints = collectEndpoints(MOUNTS);

  // 去重
  const unique = [];
  const seen = new Set();
  for (const ep of endpoints) {
    const key = `${ep.method}:${ep.fullPath}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(ep);
    }
  }

  console.log(`\n[api-coverage] 发现 ${unique.length} 个 API 端点`);

  const covered = checkEndpointCoverage(unique);

  let coveredCount = 0;
  let uncoveredCount = 0;
  const uncovered = [];

  for (const ep of unique) {
    const key = `${ep.method}:${ep.fullPath}`;
    if (covered[key]) {
      coveredCount++;
    } else {
      uncoveredCount++;
      uncovered.push(ep);
    }
  }

  const pct = unique.length > 0 ? ((coveredCount / unique.length) * 100).toFixed(1) : '100.0';

  if (uncoveredCount === 0) {
    console.log(`\n[api-coverage] ✅ 全量覆盖 — ${coveredCount}/${unique.length} (${pct}%)`);
    process.exit(0);
  }

  console.log(`\n  🔵 覆盖: ${coveredCount}/${unique.length} (${pct}%)`);
  console.log(`  🔴 遗漏: ${uncoveredCount}/${unique.length}`);

  console.log(`\n  遗漏端点:`);
  console.log(`  ┌──────────┬──────────────────────────────────────────┐`);
  console.log(`  │ 方法     │ 路径                                      │`);
  console.log(`  ├──────────┼──────────────────────────────────────────┤`);
  for (const ep of uncovered) {
    console.log(`  │ ${ep.method.padEnd(8)} │ ${ep.fullPath.padEnd(42)} │`);
  }
  console.log(`  └──────────┴──────────────────────────────────────────┘`);

  console.log(`\n[api-coverage] ❌ API 场景覆盖率 ${pct}% 未达 100%`);
  process.exit(1);
}

main();
