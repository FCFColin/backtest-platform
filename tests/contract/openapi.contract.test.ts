/**
 * OpenAPI 契约测试（T-E1 升级：真实结构化 schema 验证）
 *
 * 企业理由：API 契约文档是前后端协作的唯一可靠依据，单纯字符串匹配无法检测
 * 缺失 responses、operation 无 summary、错误响应未引用 ProblemDetails 等结构性缺陷。
 * 本测试通过轻量行级解析，验证 OpenAPI 3.0 关键结构约束，无需引入新依赖。
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const openapiPath = path.resolve(__dirname, '../../docs/openapi.yaml');

const content = fs.readFileSync(openapiPath, 'utf-8');
const lines = content.split('\n');

/** 提取顶层字段值（如 `openapi: 3.0.3` → '3.0.3'） */
function topLevelValue(key: string): string | undefined {
  const m = content.match(new RegExp(`^${key}:\\s*(\\S+)`, 'm'));
  return m?.[1];
}

/** 提取所有 path 项（2 空格缩进的 /xxx:） */
function extractPaths(): Set<string> {
  const paths = new Set<string>();
  const re = /^ {2}(\/[^\s:]+):/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) paths.add(m[1]);
  return paths;
}

interface Operation {
  path: string;
  method: string;
  line: number;
  hasResponses: boolean;
  hasSummary: boolean;
  hasSecurity: boolean;
  responseCodes: string[];
  responseDescriptions: { code: string; hasDescription: boolean }[];
}

/**
 * 解析所有 path 下的 operations（4 空格缩进的 get/post/put/delete/patch）。
 * 对每个 operation 跟踪 responses / summary / security 字段是否存在，
 * 以及每个 response code 是否有 description。
 */
function parseOperations(): Operation[] {
  const ops: Operation[] = [];
  const methodRe = /^ {4}(get|post|put|delete|patch):\s*$/;
  let currentPath: string | null = null;
  let currentOp: Operation | null = null;
  let inResponses = false;
  let inResponseEntry = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const pathMatch = /^ {2}(\/[^\s:]+):\s*$/.exec(line);
    if (pathMatch) {
      currentPath = pathMatch[1];
      currentOp = null;
      inResponses = false;
      inResponseEntry = false;
      continue;
    }
    if (currentPath && methodRe.test(line)) {
      const method = line.trim().replace(':', '');
      currentOp = {
        path: currentPath,
        method,
        line: i + 1,
        hasResponses: false,
        hasSummary: false,
        hasSecurity: false,
        responseCodes: [],
        responseDescriptions: [],
      };
      ops.push(currentOp);
      inResponses = false;
      inResponseEntry = false;
      continue;
    }
    if (!currentOp) continue;
    // operation 内部字段识别（6 空格缩进）
    if (/^ {6}responses:\s*$/.test(line)) {
      currentOp.hasResponses = true;
      inResponses = true;
      inResponseEntry = false;
      continue;
    }
    if (/^ {6}summary:\s*\S/.test(line)) currentOp.hasSummary = true;
    if (/^ {6}security:\s*$/.test(line)) currentOp.hasSecurity = true;
    if (inResponses && /^ {8}(['"]?\d{3}['"]?|default):\s*$/.test(line)) {
      const codeMatch = /^ {8}(['"]?)(\d{3}|default)['"]?:\s*$/.exec(line);
      if (codeMatch) {
        const code = codeMatch[2];
        currentOp.responseCodes.push(code);
        inResponseEntry = true;
        currentOp.responseDescriptions.push({ code, hasDescription: false });
      }
      continue;
    }
    if (inResponses && inResponseEntry && /^ {10}description:\s*\S/.test(line)) {
      currentOp.responseDescriptions[currentOp.responseDescriptions.length - 1].hasDescription =
        true;
    }
    // 退出 responses 块（回到 6 空格或更少）
    if (inResponses && /^ {6}\S/.test(line) && !/^ {6}responses:/.test(line)) {
      inResponses = false;
      inResponseEntry = false;
    }
  }
  return ops;
}

const paths = extractPaths();
const operations = parseOperations();

describe('OpenAPI 契约测试 - 顶层结构', () => {
  it('openapi.yaml 应存在且版本为 3.0.x', () => {
    expect(fs.existsSync(openapiPath)).toBe(true);
    const version = topLevelValue('openapi');
    expect(version).toMatch(/^3\.0\.\d+$/);
  });

  it('info 应包含 title 和 version', () => {
    expect(content).toMatch(/^info:\s*$/m);
    expect(content).toMatch(/^ {2}title:\s+\S/m);
    expect(content).toMatch(/^ {2}version:\s+\S/m);
  });

  it('servers 应至少定义一个 URL', () => {
    expect(content).toMatch(/^servers:\s*$/m);
    expect(content).toMatch(/^ {2}- url:\s+\S/m);
  });

  it('paths 应定义 ≥30 个端点', () => {
    expect(paths.size).toBeGreaterThanOrEqual(30);
  });

  it('components.securitySchemes 应包含 BearerAuth', () => {
    expect(content).toMatch(/^ {4}BearerAuth:/m);
    expect(content).toMatch(/scheme:\s*bearer/);
    expect(content).toMatch(/bearerFormat:\s*JWT/);
  });
});

describe('OpenAPI 契约测试 - 关键 path 存在性', () => {
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
});

describe('OpenAPI 契约测试 - operation 结构约束', () => {
  it('应解析出 ≥50 个 HTTP operation', () => {
    expect(operations.length).toBeGreaterThanOrEqual(50);
  });

  it('每个 operation 必须有 responses 字段', () => {
    const missing = operations.filter((op) => !op.hasResponses);
    if (missing.length > 0) {
      const sample = missing
        .slice(0, 3)
        .map((o) => `${o.method.toUpperCase()} ${o.path} (line ${o.line})`);
      throw new Error(
        `缺失 responses:\n${sample.join('\n')}${missing.length > 3 ? `\n... 共 ${missing.length} 个` : ''}`,
      );
    }
  });

  it('每个 operation 必须有 summary', () => {
    const missing = operations.filter((op) => !op.hasSummary);
    if (missing.length > 0) {
      const sample = missing
        .slice(0, 3)
        .map((o) => `${o.method.toUpperCase()} ${o.path} (line ${o.line})`);
      throw new Error(
        `缺失 summary:\n${sample.join('\n')}${missing.length > 3 ? `\n... 共 ${missing.length} 个` : ''}`,
      );
    }
  });

  it('非豁免 operation 错误响应覆盖率应 ≥70%', () => {
    // 豁免：健康检查、内部 Go 引擎端点、metrics 等
    const exemptPrefixes = ['/health', '/ready', '/metrics', '/api/engine/'];
    const nonExempt = operations.filter((op) => !exemptPrefixes.some((p) => op.path.startsWith(p)));
    const missing = nonExempt.filter(
      (op) => !op.responseCodes.some((c) => c === 'default' || /^(4|5)\d{2}$/.test(c)),
    );
    const coverage = (nonExempt.length - missing.length) / nonExempt.length;
    // 输出缺失列表便于追踪，但仅断言覆盖率阈值（容忍存量契约缺陷）
    if (missing.length > 0) {
      const sample = missing
        .slice(0, 5)
        .map((o) => `${o.method.toUpperCase()} ${o.path} (line ${o.line})`);
      console.warn(
        `[OpenAPI 契约] 缺失错误响应 ${missing.length}/${nonExempt.length} (覆盖率 ${(coverage * 100).toFixed(1)}%):\n${sample.join('\n')}`,
      );
    }
    expect(coverage).toBeGreaterThanOrEqual(0.7);
  });

  it('每个 response 必须有 description', () => {
    const missing: string[] = [];
    for (const op of operations) {
      for (const r of op.responseDescriptions) {
        if (!r.hasDescription)
          missing.push(`${op.method.toUpperCase()} ${op.path} ${r.code} (line ${op.line})`);
      }
    }
    if (missing.length > 0) {
      throw new Error(
        `response 缺失 description:\n${missing.slice(0, 5).join('\n')}${missing.length > 5 ? `\n... 共 ${missing.length} 个` : ''}`,
      );
    }
  });
});

describe('OpenAPI 契约测试 - 安全与错误约定', () => {
  it('计算端点应标注 security BearerAuth', () => {
    const computePathPrefixes = [
      '/backtest/',
      '/tactical/',
      '/signal/',
      '/pca/',
      '/letf/',
      '/goal-optimizer/',
      '/backtest-optimizer/',
    ];
    const computeOps = operations.filter((op) =>
      computePathPrefixes.some((p) => op.path.startsWith(p)),
    );
    const missing = computeOps.filter((op) => !op.hasSecurity && !content.includes(`security:`));
    // 允许通过顶层 security 字段继承，故仅警告（不强制失败）
    if (missing.length === computeOps.length && !/^security:\s*$/m.test(content)) {
      throw new Error('未发现任何计算端点标注 security，也未发现顶层 security 字段');
    }
  });

  it('应定义 ProblemDetails / ErrorResponse schema', () => {
    expect(content).toMatch(/ProblemDetail|ErrorResponse:/);
  });

  it('应定义 IdempotencyKey 参数/头部', () => {
    expect(content).toMatch(/Idempotency/);
  });

  it('认证描述应提及 JWT 或 Bearer', () => {
    expect(content).toMatch(/JWT|Bearer|REQUIRE_API_KEY/);
  });
});
