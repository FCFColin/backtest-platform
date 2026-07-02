import fs from 'fs';

// ===== OptimizerPage.tsx remaining fixes =====
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

processFile('d:/Project/回测平台/src/pages/OptimizerPage.tsx', [
  ['                  指标\n                 </th>', "                  {t('common.metric')}\n                 </th>"],
  ['                  最优组合\n                 </th>', "                  {t('optimizer.optimalPortfolio')}\n                 </th>'],
]);

// ===== DataEnginePage.tsx - check remaining hardcoded text =====
let dep = fs.readFileSync('d:/Project/回测平台/src/pages/DataEnginePage.tsx', 'utf8');
const depChineseMatches = dep.match(/[\u4e00-\u9fff]+/g);
if (depChineseMatches) {
  console.log('DataEnginePage remaining Chinese text count:', depChineseMatches.length);
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

// ===== BacktestPage.tsx fixes =====
let content = fs.readFileSync('d:/Project/回测平台/src/pages/BacktestPage.tsx', 'utf8');

content = content.replaceAll('TAB_GROUPS.map', 'TAB_GROUP_KEYS.map');
content = content.replaceAll('>指标\n', '>{t(\'common.metric\')}\n');
content = content.replaceAll('指标\n              </th>', '{t(\'common.metric\')}\n              </th>');
content = content.replaceAll('指标\n                  </th>', '{t(\'common.metric\')}\n                  </th>');
content = content.replaceAll('指标\n                </th>', '{t(\'common.metric\')}\n                </th>');
content = content.replaceAll("'10年安全提款率'", "t('backtest.safeWR')");
content = content.replaceAll("'10年永续提款率'", "t('backtest.perpetualWR')");
content = content.replaceAll("'20年安全提款率'", "t('backtest.safeWR')");
content = content.replaceAll("'20年永续提款率'", "t('backtest.perpetualWR')");
content = content.replaceAll("'30年安全提款率'", "t('backtest.safeWR')");
content = content.replaceAll("'30年永续提款率'", "t('backtest.perpetualWR')");
content = content.replaceAll("'40年安全提款率'", "t('backtest.safeWR')");
content = content.replaceAll("'40年永续提款率'", "t('backtest.perpetualWR')");
content = content.replaceAll('存活率`', "t('backtest.survivalRate')`");
content = content.replaceAll('保本率`', "t('backtest.preservationRate')`");
content = content.replaceAll('>组合\n                      </th>', '>{t(\'backtest.portfolio\')}\n                      </th>');
content = content.replaceAll('>日均收益\n', '>{t(\'backtest.dailyAvgReturn\')}\n');
content = content.replaceAll('>标准差\n', '>{t(\'backtest.standardDeviation\')}\n');
content = content.replaceAll('>偏度\n', '>{t(\'backtest.skewness\')}\n');
content = content.replaceAll('>超额峰度\n', '>{t(\'backtest.excessKurtosis\')}\n');
content = content.replaceAll('>正收益占比\n', '>{t(\'backtest.positiveReturnPct\')}\n');
content = content.replaceAll('>组合\n                  </th>', '>{t(\'backtest.portfolio\')}\n                  </th>');
content = content.replaceAll('>提款率', '>{t(\'backtest.withdrawalRateLabel\')}');
content = content.replaceAll('{h}年成功率', '{h}{t(\'common.years\')}{t(\'backtest.successRateYears\')}');
content = content.replaceAll("`已保存方案「${name}」`", "t('backtest.savedScheme')");
content = content.replaceAll("`已加载方案「${config.name}」`", "t('backtest.loadedScheme')");
content = content.replaceAll('{config.portfolios.length} 个组合', "{config.portfolios.length} {t('backtest.portfoliosCount')}");
content = content.replaceAll("`${label}年`", "`${label}${t('common.years')}`");
content = content.replaceAll("`${sd.name} 存活率`", "`${sd.name} ${t('backtest.survivalRate')}`");
content = content.replaceAll("`${sd.name} 保本率`", "`${sd.name} ${t('backtest.preservationRate')}`");
content = content.replaceAll("`${pt.years}年存活率`", "`${pt.years}${t('common.years')}${t('backtest.survivalRate')}`");
content = content.replaceAll("`${pt.years}年保本率`", "`${pt.years}${t('common.years')}${t('backtest.preservationRate')}`");

fs.writeFileSync('d:/Project/回测平台/src/pages/BacktestPage.tsx', content, 'utf8');
console.log('BacktestPage.tsx fixes applied');
