#!/usr/bin/env tsx
/**
 * OpenAPI 规范生成脚本（P1-05）。
 *
 * 从 packages/backend/src/schemas/openapi-registry.ts 注册中心生成 docs/openapi.yaml。
 * 单一事实来源：Zod schema -> OpenAPI 3.0，消除手动 YAML 与代码脱节。
 *
 * 运行：pnpm run generate-openapi
 * CI 校验：生成后 `git diff --exit-code docs/openapi.yaml` 强制与提交版本一致。
 *
 * 注：本脚本不在 tsconfig.backend include 内（构建期脚本，由 tsx 直接执行），
 * 因此其依赖（yaml）不参与 npm run check 的类型检查。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { generateOpenApiDocument } from '../packages/backend/src/schemas/openapi-registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputPath = path.resolve(__dirname, '..', 'docs', 'openapi.yaml');

const document = generateOpenApiDocument();

// lineWidth: 0 禁用换行，保证契约测试（tests/contract/openapi.contract.test.ts）
// 的行级正则解析（paths/operations/responses 按缩进匹配）不被软换行破坏。
let yaml = stringify(document, { lineWidth: 0 });

// 规范化 openapi 版本行为无引号字面量（契约测试期望 `openapi: 3.0.3`，
// 部分 YAML 序列化器会对版本号加引号，此处统一去除引号）。
yaml = yaml.replace(/^openapi:\s*['"]?3\.0\.3['"]?\s*$/m, 'openapi: 3.0.3');

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, yaml, 'utf8');

const lines = yaml.split('\n').length;
console.log(`[openapi] 已生成 ${outputPath}（${lines} 行）`);
