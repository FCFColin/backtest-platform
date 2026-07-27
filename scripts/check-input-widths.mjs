#!/usr/bin/env node
/**
 * P0-4: 裸 Input 宽度检查脚本
 *
 * 检查 packages/frontend/src 下所有 .tsx 文件中的 <Input> 组件
 * 是否都包含显式宽度类（className 中含 w-[ 或 max-w-[ 或 INPUT_WIDTHS）。
 *
 * 用法：node scripts/check-input-widths.mjs
 * 退出码：0 = 通过，1 = 发现裸 Input
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');
const frontendSrc = join(root, 'packages', 'frontend', 'src');

/** 递归收集所有 .tsx 文件 */
function collectTsxFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...collectTsxFiles(fullPath));
    } else if (entry.endsWith('.tsx')) {
      results.push(fullPath);
    }
  }
  return results;
}

/** 检查单文件中的裸 <Input> 用法 */
function checkFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const violations = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 匹配 <Input 但不匹配 </Input>（闭合标签）
    const inputMatch = line.match(/<Input[\s>]/);
    if (!inputMatch) continue;

    // 检查是否在同一行或接下来 5 行内有 className 且包含宽度类
    const contextLines = lines.slice(i, Math.min(i + 6, lines.length)).join('\n');

    // 允许的宽度模式
    const hasWidthClass =
      /className=.*\bw-\[/.test(contextLines) ||
      /className=.*\bmax-w-\[/.test(contextLines) ||
      /className=.*\bw-\d/.test(contextLines) ||
      /INPUT_WIDTHS/.test(contextLines) ||
      /className=.*\bflex-1\b/.test(contextLines) ||
      /className=.*\bw-full\b/.test(contextLines);

    // 豁免：Input 作为子组件被包装（如 FloatingLabelInput 内部的 input 标签）
    const isExempt =
      /<input\b/.test(line) || // 原生 input 标签，不是 shadcn Input 组件
      /displayName/.test(contextLines) ||
      /border-none/.test(contextLines); // 标题内嵌 Input 等特殊用途

    if (!hasWidthClass && !isExempt) {
      violations.push({
        file: relative(root, filePath),
        line: i + 1,
        content: line.trim(),
      });
    }
  }

  return violations;
}

// 主流程
const files = collectTsxFiles(frontendSrc);
const allViolations = [];

for (const file of files) {
  const violations = checkFile(file);
  allViolations.push(...violations);
}

if (allViolations.length > 0) {
  console.error(`\n❌ 发现 ${allViolations.length} 处裸 <Input>（缺少显式宽度类）:\n`);
  for (const v of allViolations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.content}\n`);
  }
  console.error('修复方式：在 className 中添加宽度类，如 w-[220px] 或 INPUT_WIDTHS.ticker');
  console.error('参考：packages/frontend/src/lib/layout-widths.ts\n');
  process.exit(1);
} else {
  console.log(`✅ 所有 ${files.length} 个 .tsx 文件中的 <Input> 均包含显式宽度类`);
  process.exit(0);
}
