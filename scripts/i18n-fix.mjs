import fs from 'fs';

// Fix remaining issues in BacktestPage.tsx
let content = fs.readFileSync('d:/Project/回测平台/src/pages/BacktestPage.tsx', 'utf8');

// Fix TAB_GROUPS -> TAB_GROUP_KEYS in JSX
content = content.replaceAll('TAB_GROUPS.map', 'TAB_GROUP_KEYS.map');

// Fix the "指标" table headers that weren't caught
content = content.replaceAll('>指标\n', '>{t(\'common.metric\')}\n');
content = content.replaceAll('指标\n              </th>', '{t(\'common.metric\')}\n              </th>');
content = content.replaceAll('指标\n                  </th>', '{t(\'common.metric\')}\n                  </th>');
content = content.replaceAll('指标\n                </th>', '{t(\'common.metric\')}\n                </th>');

// Fix withdrawal tab labels
content = content.replaceAll("'10年安全提款率'", "t('backtest.safeWR')");
content = content.replaceAll("'10年永续提款率'", "t('backtest.perpetualWR')");
content = content.replaceAll("'20年安全提款率'", "t('backtest.safeWR')");
content = content.replaceAll("'20年永续提款率'", "t('backtest.perpetualWR')");
content = content.replaceAll("'30年安全提款率'", "t('backtest.safeWR')");
content = content.replaceAll("'30年永续提款率'", "t('backtest.perpetualWR')");
content = content.replaceAll("'40年安全提款率'", "t('backtest.safeWR')");
content = content.replaceAll("'40年永续提款率'", "t('backtest.perpetualWR')");

// Fix survival/preservation rate labels in WithdrawalTab
content = content.replaceAll('存活率`', "t('backtest.survivalRate')`");
content = content.replaceAll('保本率`', "t('backtest.preservationRate')`");

// Fix table headers in ReturnsTab
content = content.replaceAll('>组合\n                      </th>', '>{t(\'backtest.portfolio\')}\n                      </th>');
content = content.replaceAll('>日均收益\n', '>{t(\'backtest.dailyAvgReturn\')}\n');
content = content.replaceAll('>标准差\n', '>{t(\'backtest.standardDeviation\')}\n');
content = content.replaceAll('>偏度\n', '>{t(\'backtest.skewness\')}\n');
content = content.replaceAll('>超额峰度\n', '>{t(\'backtest.excessKurtosis\')}\n');
content = content.replaceAll('>正收益占比\n', '>{t(\'backtest.positiveReturnPct\')}\n');

// Fix withdrawal success rate table headers
content = content.replaceAll('>组合\n                  </th>', '>{t(\'backtest.portfolio\')}\n                  </th>');
content = content.replaceAll('>提款率', '>{t(\'backtest.withdrawalRateLabel\')}');

// Fix {h}年成功率
content = content.replaceAll('{h}年成功率', '{h}{t(\'common.years\')}{t(\'backtest.successRateYears\')}');

// Fix saved scheme toast messages
content = content.replaceAll("`已保存方案「${name}」`", "t('backtest.savedScheme')");
content = content.replaceAll("`已加载方案「${config.name}」`", "t('backtest.loadedScheme')");

// Fix {config.portfolios.length} 个组合
content = content.replaceAll('{config.portfolios.length} 个组合', "{config.portfolios.length} {t('backtest.portfoliosCount')}");

// Fix labelFormatter 年
content = content.replaceAll("`${label}年`", "`${label}${t('common.years')}`");

// Fix Legend names with 存活率/保本率
content = content.replaceAll("`${sd.name} 存活率`", "`${sd.name} ${t('backtest.survivalRate')}`");
content = content.replaceAll("`${sd.name} 保本率`", "`${sd.name} ${t('backtest.preservationRate')}`");

// Fix rows.push labels
content = content.replaceAll("`${pt.years}年存活率`", "`${pt.years}${t('common.years')}${t('backtest.survivalRate')}`");
content = content.replaceAll("`${pt.years}年保本率`", "`${pt.years}${t('common.years')}${t('backtest.preservationRate')}`");

fs.writeFileSync('d:/Project/回测平台/src/pages/BacktestPage.tsx', content, 'utf8');
console.log('BacktestPage.tsx fixes applied');
