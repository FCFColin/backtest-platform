/**
 * OpenAPI 契约测试
 *
 * 企业理由：API 契约（OpenAPI spec）是前后端协作的基础，
 * 契约测试确保 API 实现与文档一致，防止文档漂移。
 * 权衡：维护契约测试成本 vs 避免前后端对接失败。
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('OpenAPI 契约测试', () => {
  const openapiPath = path.resolve(__dirname, '../../docs/openapi.yaml');

  it('openapi.yaml 文件应存在', () => {
    expect(fs.existsSync(openapiPath)).toBe(true);
  });

  it('应包含 /auth/login 端点', () => {
    const content = fs.readFileSync(openapiPath, 'utf-8');
    expect(content).toContain('/auth/login');
  });

  it('应包含 /auth/refresh 端点', () => {
    const content = fs.readFileSync(openapiPath, 'utf-8');
    expect(content).toContain('/auth/refresh');
  });

  it('应包含 /auth/logout 端点', () => {
    const content = fs.readFileSync(openapiPath, 'utf-8');
    expect(content).toContain('/auth/logout');
  });

  it('应包含 /auth/me 端点', () => {
    const content = fs.readFileSync(openapiPath, 'utf-8');
    expect(content).toContain('/auth/me');
  });

  it('应包含 BearerAuth 安全方案', () => {
    const content = fs.readFileSync(openapiPath, 'utf-8');
    expect(content).toContain('BearerAuth');
  });

  it('应包含 IdempotencyKey 参数定义', () => {
    const content = fs.readFileSync(openapiPath, 'utf-8');
    expect(content).toContain('IdempotencyKey');
  });

  it('应包含 ProblemDetail schema', () => {
    const content = fs.readFileSync(openapiPath, 'utf-8');
    expect(content).toContain('ProblemDetail');
  });
});
