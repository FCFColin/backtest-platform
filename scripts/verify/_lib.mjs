try {
  process.loadEnvFile('.env');
} catch {}
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, resolve, sep } from 'node:path';

const PROJECT_ROOT = resolve(process.cwd());
const OUTPUT_DIR = join(PROJECT_ROOT, 'docs', 'audit', 'verify');
mkdirSync(OUTPUT_DIR, { recursive: true });
mkdirSync(join(OUTPUT_DIR, 'screenshots'), { recursive: true });

/**
 * 写入单个 issue 的验证结果到 docs/audit/verify/{issueId}-reverify.json
 * @param {string} issueId - 问题 ID（如 C-001）
 * @param {{status: 'PASS'|'FAIL'|'SKIP'|'NEEDS_MANUAL_REVIEW', summary: string, details?: object, error?: string}} result
 * @returns {boolean} 是否 PASS
 */
export function writeResult(issueId, result) {
  const timestamp = new Date().toISOString();
  const output = { issueId, timestamp, ...result };
  const filePath = join(OUTPUT_DIR, `${issueId}-reverify.json`);
  writeFileSync(filePath, JSON.stringify(output, null, 2));
  const icon = result.status === 'PASS' ? '✓' : result.status === 'SKIP' ? '○' : '✗';
  console.log(`[${icon} ${issueId}] ${result.status}: ${result.summary}`);
  return result.status === 'PASS';
}

/**
 * 写入合并的多 issue 结果（一份 JSON 包含多个子项）
 * @param {string} aggregateId - 聚合 ID（如 C-004-006-019）
 * @param {Record<string, {status: string, summary: string, details?: object}>} results
 */
export function writeAggregatedResult(aggregateId, results) {
  const timestamp = new Date().toISOString();
  const allPass = Object.values(results).every((r) => r.status === 'PASS');
  const output = {
    aggregateId,
    timestamp,
    overallStatus: allPass ? 'PASS' : 'FAIL',
    results,
  };
  writeFileSync(join(OUTPUT_DIR, `${aggregateId}-reverify.json`), JSON.stringify(output, null, 2));
  console.log(
    `[${allPass ? '✓' : '✗'} ${aggregateId}] overall=${allPass ? 'PASS' : 'FAIL'} (${Object.keys(results).length} sub-checks)`,
  );
  return allPass;
}

/**
 * 获取 PG 客户端（基于 DATABASE_URL 或 APP_DATABASE_URL）
 * @param {{useAppRole?: boolean}} [opts] - useAppRole=true 用 backtest_app 角色
 */
export async function withDb(fn, opts = {}) {
  const { default: pg } = await import('pg');
  const url = opts.useAppRole
    ? process.env.APP_DATABASE_URL || process.env.DATABASE_URL
    : process.env.DATABASE_URL || process.env.APP_DATABASE_URL;
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export function fileExists(relativePath) {
  try {
    const abs = join(PROJECT_ROOT, relativePath);
    readFileSync(abs);
    return true;
  } catch {
    return false;
  }
}

export function readFileContent(relativePath) {
  return readFileSync(join(PROJECT_ROOT, relativePath), 'utf-8');
}

/**
 * 跨平台 grep：扫描指定目录下文件内容，返回匹配行
 * @param {RegExp} pattern - 正则
 * @param {string} relativeDir - 相对项目根的目录
 * @param {{extensions?: string[], ignoreDirs?: string[], maxResults?: number}} [opts]
 * @returns {{file: string, line: number, text: string}[]}
 */
export function grepInCode(pattern, relativeDir, opts = {}) {
  const extensions = opts.extensions ?? [
    '.ts',
    '.tsx',
    '.js',
    '.mjs',
    '.go',
    '.yaml',
    '.yml',
    '.json',
    '.md',
    '.sql',
  ];
  const ignoreDirs = new Set(
    opts.ignoreDirs ?? ['node_modules', 'dist', 'build', '.git', 'coverage', 'docs/audit'],
  );
  const maxResults = opts.maxResults ?? 500;
  const results = [];
  const absDir = join(PROJECT_ROOT, relativeDir);
  if (!existsSync(absDir)) return results;

  function walk(dir) {
    if (results.length >= maxResults) return;
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (results.length >= maxResults) return;
      const full = join(dir, name);
      const rel = full.replace(absDir + sep, '').replace(/\//g, sep);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (ignoreDirs.has(name)) continue;
        walk(full);
      } else {
        const ext = '.' + name.split('.').pop();
        if (!extensions.includes(ext)) continue;
        let content;
        try {
          content = readFileSync(full, 'utf-8');
        } catch {
          continue;
        }
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (pattern.test(lines[i])) {
            results.push({
              file: join(relativeDir, rel).replace(/\\/g, '/'),
              line: i + 1,
              text: lines[i].trim(),
            });
            if (results.length >= maxResults) return;
          }
        }
      }
    }
  }
  walk(absDir);
  return results;
}

/** 执行 shell 命令（跨平台，返回 stdout/exit code）。 */
export function runCmd(cmd, opts = {}) {
  try {
    const out = execSync(cmd, {
      encoding: 'utf-8',
      cwd: PROJECT_ROOT,
      timeout: opts.timeout ?? 60000,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...(opts.env ?? {}) },
    });
    return { code: 0, out, err: '' };
  } catch (e) {
    return {
      code: e.status ?? 1,
      out: e.stdout?.toString?.() ?? '',
      err: e.stderr?.toString?.() ?? e.message ?? '',
    };
  }
}

/**
 * 执行单个验证项：统一 try/catch 包装，异常时记为 FAIL
 * @param {Record<string, object>} results - 聚合结果容器
 * @param {string} issueId - 验证项 ID（如 C-002）
 * @param {() => (object | Promise<object>)} fn - 验证逻辑，返回 {status, summary, details}
 */
export async function runCheck(results, issueId, fn) {
  try {
    results[issueId] = await fn();
  } catch (e) {
    results[issueId] = {
      status: 'FAIL',
      summary: `验证脚本异常: ${e.message}`,
      details: { error: e.message, stack: e.stack },
    };
  }
}

/**
 * 输出聚合结果并以 0 退出（verify 脚本统一收尾）
 * @param {string} aggregateId - 聚合 ID（如 verify-backend）
 * @param {Record<string, object>} results - 子项结果
 */
export function finishVerify(aggregateId, results) {
  writeAggregatedResult(aggregateId, results);
  process.exit(0);
}

export const PROJECT_ROOT_PATH = PROJECT_ROOT;
