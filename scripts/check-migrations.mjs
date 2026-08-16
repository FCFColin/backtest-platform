#!/usr/bin/env node
/**
 * CI 迁移完整性检查（ADR-002，forward-only，见 ADR-018）。
 *
 * 检查项：
 * 1. 迁移文件命名遵循 NNN_descriptive_name.sql 约定（3 位零填充序号）
 * 2. 文件序号连续无空隙（001, 002, ..., N）
 * 3. migrations.ts 注册表版本号与磁盘文件一致（无遗漏、无多余、无重复）
 * 4. 注册表版本号连续且与文件序号对齐
 *
 * 用法：node scripts/check-migrations.mjs
 * 退出码：0 = 全部通过，1 = 存在违规（CI 失败）
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'migrations');
const REGISTRY_FILE = path.join(ROOT, 'packages', 'backend', 'src', 'db', 'migrations.ts');

const NAME_PATTERN = /^(\d{3})_[a-z][a-z0-9_]*\.sql$/;

const errors = [];
const warnings = [];

function error(msg) {
  errors.push(msg);
}

function warn(msg) {
  warnings.push(msg);
}

function assertContinuous(versions, msg) {
  const sorted = [...versions].sort((a, b) => a - b);
  for (let v = sorted[0]; v <= sorted[sorted.length - 1]; v++) {
    if (!sorted.includes(v)) error(msg(v));
  }
}

if (!fs.existsSync(MIGRATIONS_DIR)) {
  console.error(`✗ 迁移目录不存在: ${MIGRATIONS_DIR}`);
  process.exit(1);
}

const allFiles = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
const upFiles = [...allFiles].sort();

console.log(`迁移目录: ${MIGRATIONS_DIR}`);
console.log(`迁移文件: ${upFiles.length}\n`);

// --- 检查 1: 文件命名约定 ---
for (const f of upFiles) {
  if (!NAME_PATTERN.test(f)) {
    error(`命名违规（应为 NNN_name.sql）: ${f}`);
  }
}

// --- 检查 2: 序号连续无空隙 ---
const upVersions = [];
const versionToFiles = new Map();

for (const f of upFiles) {
  const match = f.match(/^(\d{3})_/);
  if (!match) continue;
  const v = parseInt(match[1], 10);
  upVersions.push(v);
  if (versionToFiles.has(v)) {
    error(`重复序号 ${String(v).padStart(3, '0')}: ${versionToFiles.get(v)} 与 ${f}`);
  }
  versionToFiles.set(v, f);
}

upVersions.sort((a, b) => a - b);

if (upVersions.length > 0) {
  assertContinuous(upVersions, (v) => `序号空隙: 缺少 ${String(v).padStart(3, '0')}_*.sql`);
}

// --- 检查 3 & 4: 注册表一致性 ---
let registryEntries = [];

if (fs.existsSync(REGISTRY_FILE)) {
  const content = fs.readFileSync(REGISTRY_FILE, 'utf-8');
  const entryPattern = /version:\s*(\d+)\s*,\s*upFile:\s*'([^']+)'/g;
  let match;
  while ((match = entryPattern.exec(content)) !== null) {
    registryEntries.push({
      version: parseInt(match[1], 10),
      upFile: match[2],
    });
  }
  console.log(`注册表: ${REGISTRY_FILE}`);
  console.log(`注册条目: ${registryEntries.length}\n`);
} else {
  warn(`注册表文件不存在: ${REGISTRY_FILE}（跳过注册表一致性检查）`);
}

if (registryEntries.length > 0) {
  const registryVersions = registryEntries.map((e) => e.version);
  const seenVersions = new Set();

  for (const entry of registryEntries) {
    if (seenVersions.has(entry.version)) {
      error(`注册表重复版本: ${entry.version}`);
    }
    seenVersions.add(entry.version);

    if (!upFiles.includes(entry.upFile)) {
      error(`注册表引用的迁移文件不存在: ${entry.upFile}（版本 ${entry.version}）`);
    }

    const fileVersion = parseInt(entry.upFile.match(/^(\d{3})_/)?.[1] ?? '0', 10);
    if (fileVersion !== entry.version) {
      error(
        `注册表版本号与文件名不匹配: 版本 ${entry.version}，文件 ${entry.upFile}（文件序号 ${fileVersion}）`,
      );
    }
  }

  for (const v of upVersions) {
    if (!seenVersions.has(v)) {
      error(`磁盘文件 ${String(v).padStart(3, '0')}_*.sql 存在但未在注册表中登记`);
    }
  }

  for (const entry of registryEntries) {
    if (!upVersions.includes(entry.version)) {
      error(`注册表版本 ${entry.version} 在磁盘上无对应文件`);
    }
  }

  assertContinuous(registryVersions, (v) => `注册表序号空隙: 缺少版本 ${v}`);
}

// --- 输出结果 ---
if (warnings.length > 0) {
  console.log('⚠ 警告:');
  for (const w of warnings) console.log(`  ${w}`);
  console.log();
}

if (errors.length > 0) {
  console.error(`✗ 发现 ${errors.length} 个错误:`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

console.log('✓ 迁移完整性检查通过（文件命名、序号连续、注册表一致）');
process.exit(0);
