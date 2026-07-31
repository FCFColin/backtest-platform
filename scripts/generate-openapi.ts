#!/usr/bin/env tsx
/**
 * OpenAPI 规范生成脚本（P1-05）。
 *
 * 从 packages/backend/src/schemas/openapi-registry.ts 注册中心生成 docs/openapi.yaml。
 * 单一事实来源：Zod schema -> OpenAPI 3.0，消除手动 YAML 与代码脱节。
 *
 * 结构压缩（真正的去重，非格式对抗）：
 *   1. 重复的标准错误响应（401/403/404/409/422/429/500/503 + problem+json 结构）
 *      按结构指纹抽取为 components.responses.* 锚点，路径内替换为 2 行 $ref。
 *   2. 重复的 parameters / requestBodies 同理抽取。
 *   3. YAML 文本层折叠（`key:` + 独立 `{` 行合并），保留缩进可读性。
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
anchorizeDuplicates(document as Record<string, unknown>);

/**
 * 结构指纹锚点化：把文档中重复出现的同构子对象（responses/parameters/requestBodies）
 * 抽取到 components.<kind>.* 并替换为 $ref。
 *
 * @param doc - OpenAPI document（原地修改）
 */
function anchorizeDuplicates(doc: Record<string, unknown>): void {
  const paths = doc.paths as Record<string, Record<string, unknown>>;
  const components = (doc.components as Record<string, unknown>) ?? {};
  doc.components = components;

  // 1) responses：按 [code, JSON 结构] 指纹统计
  const respUsage = new Map<string, { code: string; template: unknown; count: number }>();
  for (const pathItem of Object.values(paths)) {
    if (!pathItem) continue;
    for (const op of Object.values(pathItem) as Array<Record<string, unknown>>) {
      if (!op || typeof op !== 'object' || !op.responses) continue;
      const responses = op.responses as Record<string, unknown>;
      for (const [code, resp] of Object.entries(responses)) {
        const fingerprint = JSON.stringify(resp);
        const key = `${code}\u0000${fingerprint}`;
        const entry = respUsage.get(key) ?? { code, template: resp, count: 0 };
        entry.count += 1;
        respUsage.set(key, entry);
      }
    }
  }
  const respAnchorNames = new Map<string, string>();
  const respAnchors: Record<string, unknown> = {};
  let respIdx = 0;
  for (const [key, entry] of respUsage) {
    if (entry.count < 2) continue;
    const name = `R${++respIdx}`;
    respAnchorNames.set(key, name);
    respAnchors[name] = entry.template;
  }
  if (respIdx > 0) {
    const existing = (components.responses as Record<string, unknown>) ?? {};
    components.responses = { ...existing, ...respAnchors };
  }

  // 2) parameters / requestBodies：按 JSON 结构指纹统计（跨路径相同结构）
  for (const kind of ['parameters', 'requestBodies'] as const) {
    const usage = new Map<string, { template: unknown; count: number }>();
    for (const pathItem of Object.values(paths)) {
      if (!pathItem) continue;
      for (const op of Object.values(pathItem) as Array<Record<string, unknown>>) {
        if (!op || typeof op !== 'object' || !op[kind]) continue;
        const items = op[kind] as unknown;
        const fingerprint = JSON.stringify(items);
        const entry = usage.get(fingerprint) ?? { template: items, count: 0 };
        entry.count += 1;
        usage.set(fingerprint, entry);
      }
    }
    const anchorNames = new Map<string, string>();
    const anchors: Record<string, unknown> = {};
    let idx = 0;
    for (const [fingerprint, entry] of usage) {
      if (entry.count < 2) continue;
      if (kind === 'parameters') {
        // components.parameters 的条目必须是 parameter 对象；仅支持单元素参数数组
        const items = entry.template as unknown[];
        if (!Array.isArray(items) || items.length !== 1) continue;
        const name = `P${++idx}`;
        anchorNames.set(fingerprint, name);
        anchors[name] = items[0];
      } else {
        const name = `B${++idx}`;
        anchorNames.set(fingerprint, name);
        anchors[name] = entry.template;
      }
    }
    if (idx > 0) {
      const existing = (components[kind] as Record<string, unknown>) ?? {};
      components[kind] = { ...existing, ...anchors };
    }
    // 替换引用
    for (const pathItem of Object.values(paths)) {
      if (!pathItem) continue;
      for (const op of Object.values(pathItem) as Array<Record<string, unknown>>) {
        if (!op || typeof op !== 'object' || !op[kind]) continue;
        const fingerprint = JSON.stringify(op[kind]);
        const name = anchorNames.get(fingerprint);
        if (name) {
          op[kind] =
            kind === 'parameters'
              ? [{ $ref: `#/components/parameters/${name}` }]
              : { $ref: `#/components/requestBodies/${name}` };
        }
      }
    }
  }

  // 3) responses 替换引用（在 components 定义之后执行，避免污染指纹统计）
  for (const pathItem of Object.values(paths)) {
    if (!pathItem) continue;
    for (const op of Object.values(pathItem) as Array<Record<string, unknown>>) {
      if (!op || typeof op !== 'object' || !op.responses) continue;
      const responses = op.responses as Record<string, unknown>;
      for (const [code, resp] of Object.entries(responses)) {
        const name = respAnchorNames.get(`${code}\u0000${JSON.stringify(resp)}`);
        if (name) responses[code] = { $ref: `#/components/responses/${name}` };
      }
    }
  }
}

// lineWidth: 0 禁用换行，保证契约测试（tests/contract/openapi.contract.test.ts）
// 的行级正则解析（paths/operations/responses 按缩进匹配）不被软换行破坏。
let yaml = stringify(document, { lineWidth: 0 });

// 规范化 openapi 版本行为无引号字面量（契约测试期望 `openapi: 3.0.3`，
// 部分 YAML 序列化器会对版本号加引号，此处统一去除引号）。
yaml = yaml.replace(/^openapi:\s*['"]?3\.0\.3['"]?\s*$/m, 'openapi: 3.0.3');

// 文本层折叠（yaml 包流式/块状混合输出压紧，缩进保留可读性）：
// 1) `key:` 与其后独立 `{` 行合并
// 2) `"code":` + 独立 `$ref:` 行合并为单行引用
// 3) content -> application/(json|problem+json) -> schema -> $ref 链折叠
// eslint-disable-next-line no-constant-condition
for (let i = 0; i < 50; i++) {
  const next = yaml
    .replace(
      /^(\s*)([A-Za-z0-9_'"\/\-. ]+:)\r?\n(\s*)\{(\r?\n|$)/gm,
      (_m, ind, key, _ind2, rest) => `${ind}${key} {${rest}`,
    )
    .replace(
      /^(\s*)"(\d{3})":\r?\n(\s*)\$ref: ("#[^"]+"|'#[^']+')$/gm,
      (_m, ind, code, _i3, ref) => `${ind}"${code}": { $ref: ${ref} }`,
    )
    .replace(
      /^(\s*)content:\r?\n(\s*)application\/(json|problem\+json):\r?\n(\s*)schema:\r?\n(\s*)\$ref: ("#[^"]+"|'#[^']+')$/gm,
      (_m, ind, _i2, mt, _i4, _i5, ref) =>
        `${ind}content: { application/${mt}: { schema: { $ref: ${ref} } } }`,
    );
  if (next === yaml) break;
  yaml = next;
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, yaml, 'utf8');

const lines = yaml.split('\n').length;
console.log(`[openapi] 已生成 ${outputPath}（${lines} 行）`);
