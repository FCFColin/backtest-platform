// C-015: ADR 索引验证
// 读 docs/adr/README.md，提取"当前有效 ADR"部分的 ADR-XXX 引用
// 列出 docs/adr/ADR-*.md 实际文件，diff 两个集合
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readFileContent, writeResult, fileExists, PROJECT_ROOT_PATH } from './_lib.mjs';

try {
  if (!fileExists('docs/adr/README.md')) {
    writeResult('C-015', {
      status: 'FAIL',
      summary: 'docs/adr/README.md 不存在',
    });
    process.exit(0);
  }

  const readme = readFileContent('docs/adr/README.md');

  // 按 section 拆分，只提取"当前有效 ADR"部分的 ADR-XXX 引用
  // section 格式: "## 当前有效 ADR", "## 已删除（被取代或低价值）", "## 待落地优先级"
  const sections = readme.split(/^## /m);
  const activeSection = sections.find(s => s.startsWith('当前有效')) ?? '';
  const deletedSection = sections.find(s => s.startsWith('已删除')) ?? '';

  // 从"当前有效"部分提取 ADR-XXX
  const activeAdrs = new Set(activeSection.match(/ADR-\d+/g) ?? []);
  // 从"已删除"部分提取 ADR-XXX（用于排除）
  const deletedAdrs = new Set(deletedSection.match(/ADR-\d+/g) ?? []);

  // 列出实际 ADR 文件（文件名格式: ADR-004-Express框架选型.md 或 ADR-004.md）
  const adrDir = join(PROJECT_ROOT_PATH, 'docs', 'adr');
  let files = [];
  try {
    files = readdirSync(adrDir).filter(f => /^ADR-\d+.*\.md$/.test(f));
  } catch {
    // 目录不存在或读取失败
  }
  // 从文件名提取 ADR-XXX
  const fileAdrs = new Set(files.map(f => {
    const m = f.match(/^(ADR-\d+)/);
    return m ? m[1] : null;
  }).filter(Boolean));

  // diff: 只比较"当前有效"部分的 ADR 与实际文件
  const sortByNum = (a, b) => parseInt(a.replace('ADR-', '')) - parseInt(b.replace('ADR-', ''));
  const inIndexNotInFiles = [...activeAdrs].filter(a => !fileAdrs.has(a)).sort(sortByNum);
  const inFilesNotInIndex = [...fileAdrs].filter(a => !activeAdrs.has(a) && !deletedAdrs.has(a)).sort(sortByNum);

  const noDiff = inIndexNotInFiles.length === 0 && inFilesNotInIndex.length === 0;

  writeResult('C-015', {
    status: noDiff ? 'PASS' : 'FAIL',
    summary: noDiff
      ? `ADR 索引与文件一致 (${fileAdrs.size} 个 ADR 文件, ${activeAdrs.size} 个有效, ${deletedAdrs.size} 个已删除/合并)`
      : `ADR 索引差异: 有效索引有但文件缺失 [${inIndexNotInFiles.join(', ')}], 文件有但索引缺失 [${inFilesNotInIndex.join(', ')}]`,
    details: {
      activeCount: activeAdrs.size,
      deletedCount: deletedAdrs.size,
      fileCount: fileAdrs.size,
      inIndexNotInFiles,
      inFilesNotInIndex,
      deletedAdrs: [...deletedAdrs].sort(sortByNum),
    },
  });
} catch (e) {
  writeResult('C-015', {
    status: 'FAIL',
    summary: `验证脚本异常: ${e.message}`,
    error: e.message,
  });
}