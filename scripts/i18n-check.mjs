import fs from 'fs';

function processFile(filePath, replacements) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = 0;
  for (const [oldStr, newStr] of replacements) {
    if (content.includes(oldStr)) {
      content = content.replaceAll(oldStr, newStr);
      changed++;
    } else {
      console.warn(`  SKIP: ${oldStr.substring(0, 60)}`);
    }
  }
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`OK: ${filePath} (${changed} replacements)`);
}

// ===== OptimizerPage.tsx remaining fixes =====
processFile('d:/Project/回测平台/src/pages/OptimizerPage.tsx', [
  ['                  指标\n                 </th>', "                  {t('common.metric')}\n                 </th>"],
  ['                  最优组合\n                 </th>', "                  {t('optimizer.optimalPortfolio')}\n                 </th>"],
]);

// ===== DataEnginePage.tsx - check remaining hardcoded text =====
let dep = fs.readFileSync('d:/Project/回测平台/src/pages/DataEnginePage.tsx', 'utf8');
// The first pass replaced string literals in error messages but the JSX text is still hardcoded
// Let me check what's left
const depChineseMatches = dep.match(/[\u4e00-\u9fff]+/g);
if (depChineseMatches) {
  console.log('DataEnginePage remaining Chinese text count:', depChineseMatches.length);
  // Print unique ones
  const unique = [...new Set(depChineseMatches)];
  console.log('Unique:', unique.slice(0, 30).join(', '));
}

// ===== AnalysisPage.tsx - check remaining hardcoded text =====
let ap = fs.readFileSync('d:/Project/回测平台/src/pages/AnalysisPage.tsx', 'utf8');
const apChineseMatches = ap.match(/[\u4e00-\u9fff]+/g);
if (apChineseMatches) {
  console.log('AnalysisPage remaining Chinese text count:', apChineseMatches.length);
  const unique = [...new Set(apChineseMatches)];
  console.log('Unique:', unique.slice(0, 30).join(', '));
}
