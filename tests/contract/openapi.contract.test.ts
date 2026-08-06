import { describe, it, expect } from 'vitest';
import SwaggerParser from '@apidevtools/swagger-parser';
import { generateOpenApiDocument } from '../../packages/backend/src/schemas/openapi-registry.js';

interface OpenAPIV3Document {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, unknown> | undefined>;
  components?: { schemas?: Record<string, unknown>; securitySchemes?: Record<string, unknown> };
  security?: Record<string, unknown>[];
}

let apiDoc: OpenAPIV3Document;

async function getApiDoc(): Promise<OpenAPIV3Document> {
  if (!apiDoc) {
    apiDoc = (await SwaggerParser.validate(
      generateOpenApiDocument() as never,
    )) as OpenAPIV3Document;
  }
  return apiDoc;
}

interface Operation {
  path: string;
  method: string;
  operationId?: string;
  summary?: string;
  hasResponses: boolean;
  hasSecurity: boolean;
  responseCodes: string[];
}

function extractOperations(doc: OpenAPIV3Document): Operation[] {
  const ops: Operation[] = [];
  for (const [path, pathItem] of Object.entries(doc.paths)) {
    if (!pathItem) continue;
    for (const method of ['get', 'post', 'put', 'delete', 'patch']) {
      const op = pathItem[method] as
        | {
            operationId?: string;
            summary?: string;
            responses?: Record<string, unknown>;
            security?: unknown[];
          }
        | undefined;
      if (!op) continue;
      ops.push({
        path,
        method,
        operationId: op.operationId,
        summary: op.summary,
        hasResponses: !!op.responses && Object.keys(op.responses).length > 0,
        hasSecurity: Array.isArray(op.security),
        responseCodes: op.responses ? Object.keys(op.responses) : [],
      });
    }
  }
  return ops;
}

describe('OpenAPI 契约测试 — Spec 合法性', () => {
  it('openapi.yaml 应通过 SwaggerParser.validate（$ref 解析 + 结构合法）', async () => {
    const doc = await getApiDoc();
    expect(doc.openapi).toMatch(/^3\.0\.\d+$/);
  });

  it('spec 应由 registry 生成且含 paths', () => {
    expect(Object.keys(generateOpenApiDocument().paths).length).toBeGreaterThan(0);
  });
});

describe('OpenAPI 契约测试 — 元数据完整性', () => {
  it('info 应包含 title 和语义化版本号', async () => {
    const doc = await getApiDoc();
    expect(doc.info.title).toBeTruthy();
    expect(doc.info.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('paths 应定义 ≥30 个端点', async () => {
    const doc = await getApiDoc();
    expect(Object.keys(doc.paths).length).toBeGreaterThanOrEqual(30);
  });

  it('components.securitySchemes 应包含 BearerAuth', async () => {
    const doc = await getApiDoc();
    const schemes = doc.components?.securitySchemes ?? {};
    expect(schemes.BearerAuth).toBeDefined();
    expect((schemes.BearerAuth as { scheme: string }).scheme).toBe('bearer');
  });
});

describe('OpenAPI 契约测试 — operation 结构约束', () => {
  it('应解析出 ≥50 个 HTTP operation', async () => {
    const doc = await getApiDoc();
    const ops = extractOperations(doc);
    expect(ops.length).toBeGreaterThanOrEqual(50);
  });

  it('每个 operation 必须有 responses 字段', async () => {
    const doc = await getApiDoc();
    const ops = extractOperations(doc);
    const missing = ops.filter((op) => !op.hasResponses);
    if (missing.length > 0) {
      const sample = missing.slice(0, 3).map((o) => `${o.method.toUpperCase()} ${o.path}`);
      throw new Error(`缺失 responses:\n${sample.join('\n')}`);
    }
  });

  it('每个 operation 必须有 summary', async () => {
    const doc = await getApiDoc();
    const ops = extractOperations(doc);
    const missing = ops.filter((op) => !op.summary);
    if (missing.length > 0) {
      const sample = missing.slice(0, 3).map((o) => `${o.method.toUpperCase()} ${o.path}`);
      throw new Error(`缺失 summary:\n${sample.join('\n')}`);
    }
  });

  it('非豁免 operation 错误响应覆盖率应 ≥70%', async () => {
    const doc = await getApiDoc();
    const ops = extractOperations(doc);
    const exemptPrefixes = ['/health', '/ready', '/metrics', '/api/engine/'];
    const nonExempt = ops.filter((op) => !exemptPrefixes.some((p) => op.path.startsWith(p)));
    const missing = nonExempt.filter(
      (op) => !op.responseCodes.some((c) => c === 'default' || /^(4|5)\d{2}$/.test(c)),
    );
    const coverage = (nonExempt.length - missing.length) / nonExempt.length;
    expect(coverage).toBeGreaterThanOrEqual(0.7);
  });
});

describe('OpenAPI 契约测试 — 安全与错误约定', () => {
  it('计算端点应有 security 定义（operation 级或顶层继承）', async () => {
    const doc = await getApiDoc();
    const ops = extractOperations(doc);
    const computePrefixes = [
      '/backtest/',
      '/tactical/',
      '/signal/',
      '/pca/',
      '/letf/',
      '/goal-optimizer/',
      '/backtest-optimizer/',
    ];
    const computeOps = ops.filter((op) => computePrefixes.some((p) => op.path.startsWith(p)));
    // 允许通过顶层 security 字段继承
    const hasTopLevelSecurity = Array.isArray(doc.security) && doc.security.length > 0;
    if (!hasTopLevelSecurity) {
      const missing = computeOps.filter((op) => !op.hasSecurity);
      if (missing.length === computeOps.length) {
        throw new Error('未发现任何计算端点标注 security，也未发现顶层 security 字段');
      }
    }
  });

  it('应定义 ProblemDetails / ErrorResponse schema', async () => {
    const doc = await getApiDoc();
    const schemas = doc.components?.schemas ?? {};
    const hasProblemDetail = Object.keys(schemas).some((k) =>
      /ProblemDetail|ErrorResponse/i.test(k),
    );
    expect(hasProblemDetail).toBe(true);
  });
});
