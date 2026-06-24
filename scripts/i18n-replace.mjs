import fs from 'fs';

// Helper: read, replace, write
function processFile(filePath, replacements) {
  let content = fs.readFileSync(filePath, 'utf8');
  for (const [oldStr, newStr] of replacements) {
    if (!content.includes(oldStr)) {
      console.warn(`  WARNING: pattern not found in ${filePath}: ${oldStr.substring(0, 60)}...`);
    }
    content = content.replaceAll(oldStr, newStr);
  }
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`OK: ${filePath}`);
}

// ===== BacktestPage.tsx =====
const bp = 'd:/Project/回测平台/src/pages/BacktestPage.tsx';
const bpReplacements = [
  // Import
  ["import { Link } from 'react-router-dom';", "import { Link } from 'react-router-dom';\nimport { useTranslation } from 'react-i18next';"],

  // TAB_GROUPS -> TAB_GROUP_KEYS
  ["group: '概览',", "groupKey: 'tabs.summary',"],
  ["group: '收益',", "groupKey: 'tabs.returns',"],
  ["group: '事件',", "groupKey: 'tabs.events',"],
  ["group: '配置',", "groupKey: 'tabs.allocation',"],
  ["group: '信号与状态',", "groupKey: 'tabs.signalsStatus',"],
  ["label: '概览' },", "labelKey: 'tabs.summary' },"],
  ["label: '统计指标' },", "labelKey: 'tabs.metrics' },"],
  ["label: '自定义指标' },", "labelKey: 'tabs.myMetrics' },"],
  ["label: '收益分布' },", "labelKey: 'tabs.returnsDist' },"],
  ["label: '滚动指标' },", "labelKey: 'tabs.rolling' },"],
  ["label: '季节性' },", "labelKey: 'tabs.seasonality' },"],
  ["label: '风险与收益' },", "labelKey: 'tabs.riskReturn' },"],
  ["label: '提款统计' },", "labelKey: 'tabs.withdrawal' },"],
  ["label: '现金流' },", "labelKey: 'tabs.cashflows' },"],
  ["label: '再平衡统计' },", "labelKey: 'tabs.rebalancing' },"],
  ["label: '周转与税务' },", "labelKey: 'tabs.turnover' },"],
  ["label: '组合配置' },", "labelKey: 'tabs.portfolioAllocation' },"],
  ["label: '配置饼图' },", "labelKey: 'tabs.pies' },"],
  ["label: '相关性与Beta' },", "labelKey: 'tabs.correlation' },"],
  ["label: '述事图' },", "labelKey: 'tabs.telltale' },"],
  ["label: '回归' },", "labelKey: 'tabs.regression' },"],
  ["const TAB_GROUPS = [", "const TAB_GROUP_KEYS = ["],
  ["group:", "groupKey:"],
  ["labelKey:", "labelKey:"],  // already done
  ["{group.group}", "{t(group.groupKey)}"],
  ["{tab.label}", "{t(tab.labelKey)}"],
  ["key={group.group}", "key={group.groupKey}"],

  // SummaryQuickStats
  ["function SummaryQuickStats({ portfolios }: { portfolios: PortfolioResult[] }) {\n  if (portfolios.length === 0) return null;",
   "function SummaryQuickStats({ portfolios }: { portfolios: PortfolioResult[] }) {\n  const { t } = useTranslation();\n  if (portfolios.length === 0) return null;"],
  ['label="CAGR"', "label={t('backtest.cagr')}"],
  ['label="最大回撤"', "label={t('backtest.maxDrawdown')}"],
  ['label="夏普比率"', "label={t('backtest.sharpeRatio')}"],
  ['label="SWR 30年"', "label={t('backtest.swr30y')}"],

  // KeyStatsSummary
  ["function KeyStatsSummary({ portfolios }: { portfolios: PortfolioResult[] }) {\n  if (portfolios.length === 0) return null;",
   "function KeyStatsSummary({ portfolios }: { portfolios: PortfolioResult[] }) {\n  const { t } = useTranslation();\n  if (portfolios.length === 0) return null;"],
  ["label: '年化收益率 (CAGR)'", "label: t('backtest.cagr')"],
  ["label: 'MWRR*'", "label: t('backtest.mwrr')"],
  ["label: '年化波动率'", "label: t('backtest.stdev')"],
  ["label: '夏普比率'", "label: t('backtest.sharpeRatio')"],
  ["label: '索提诺比率'", "label: t('backtest.sortino')"],
  ["label: '最大回撤'", "label: t('backtest.maxDrawdown')"],
  ["label: '卡尔玛比率'", "label: t('backtest.calmar')"],
  ["label: '正收益年占比'", "label: t('backtest.pctPositiveYears')"],
  [">关键统计摘要</div>", ">{t('backtest.keyStatsSummary')}</div>"],

  // WithdrawalTab
  ["function WithdrawalTab({ portfolios }: { portfolios: PortfolioResult[] }) {\n  const pfList = portfolios;",
   "function WithdrawalTab({ portfolios }: { portfolios: PortfolioResult[] }) {\n  const { t } = useTranslation();\n  const pfList = portfolios;"],
  [">提款率曲线</div>", ">{t('backtest.withdrawalCurve')}</div>"],
  ["SWR/PWR 随退休年限变化（10/20/30/40年为实际数据，其余为线性插值）", "{t('backtest.swrPwrDesc')}"],
  ["value: '退休年限'", "value: t('backtest.retirementYears')"],
  ["value: '提款率', angle:", "value: t('backtest.withdrawalRate'), angle:"],
  ["value: '持有年限'", "value: t('backtest.holdingYears')"],
  ["'SWR 安全提款率' : 'PWR 永续提款率'", "t('backtest.swrSafe') : t('backtest.pwrPerpetual')"],
  [">存活率与保本率</div>", ">{t('backtest.survivalPreservation')}</div>"],
  ["存活率 = 期末组合价值 &gt; 0 的滚动窗口比例；保本率 = 期末组合价值 ≥ 初始值的滚动窗口比例", "{t('backtest.survivalDesc')}"],
  [">存活率与保本率详情</div>", ">{t('backtest.survivalPreservationDetail')}</div>"],
  [">提款统计详情</div>", ">{t('backtest.withdrawalStats')}</div>"],
  [">提款率成功率</div>", ">{t('backtest.withdrawalSuccessRate')}</div>"],
  ["在不同提款率（3%-5%）与退休年限下，组合价值能维持至期末（&gt;0）的滚动窗口成功比例", "{t('backtest.withdrawalSuccessDesc')}"],

  // ReturnsTab
  ["const ReturnsTab = memo(function ReturnsTab({ portfolios }: { portfolios: PortfolioResult[] }) {",
   "const ReturnsTab = memo(function ReturnsTab({ portfolios }: { portfolios: PortfolioResult[] }) {\n  const { t } = useTranslation();"],
  ["label: '年度收益' },", "label: t('tabs.annualReturns') },"],
  ["label: '月度收益' },", "label: t('tabs.monthlyReturns') },"],
  ["label: '日收益分布' },", "label: t('tabs.dailyReturns') },"],
  [">日收益分布直方图</div>", ">{t('backtest.dailyReturnsHist')}</div>"],
  ["value: '频次', angle:", "value: t('backtest.frequency'), angle:"],
  [">日收益统计</div>", ">{t('backtest.dailyReturnsStats')}</div>"],

  // Main BacktestPage
  ["export default function BacktestPage() {", "export default function BacktestPage() {\n  const { t } = useTranslation();"],
  [">组合回测</h1>", ">{t('backtest.title')}</h1>"],
  [">组合增长</div>", ">{t('backtest.growth')}</div>"],
  [">回撤</div>", ">{t('backtest.drawdown')}</div>"],
  ["'运行中...' : '开始回测'", "t('backtest.running') : t('backtest.runButton')"],
  ["保存组合\n              </button>", "{t('backtest.savePortfolio')}\n              </button>"],
  ["加载组合\n              </button>", "{t('backtest.loadPortfolio')}\n              </button>"],
  ['title="生成分享链接"', "title={t('backtest.shareLink')}"],
  ['placeholder="输入方案名称"', "placeholder={t('backtest.configNamePlaceholder')}"],
  ['>确认</button>', ">{t('common.confirm')}</button>"],
  ['暂无保存的方案', "{t('backtest.noSavedSchemes')}"],
  ['配置参数和组合后点击"开始回测"查看结果', "{t('backtest.noResultsHint')}"],
  ["加载中...", "{t('common.loading')}"],

  // Toast messages
  ["'分享链接已复制到剪贴板'", "t('backtest.shareLinkCopied')"],
  ["'分享链接已生成（请手动复制地址栏）'", "t('backtest.shareLinkManual')"],
  ["'已从分享链接加载配置'", "t('backtest.loadedFromShare')"],
  ["'优化器数据格式错误，无法加载'", "t('backtest.optimizerDataError')"],
  ["'分享链接数据格式错误'", "t('backtest.shareDataError')"],

  // SEO
  ["本平台是一款投资组合回测工具，支持 ETF、股票、基金、模拟标的及自定义序列。\n          您可以在同一历史区间内比较多个组合，测试调仓规则，模拟投入或提取，查看回撤、滚动收益、相关性及提款结果。", "{t('backtest.seoDesc')}"],
  [">可建模内容</div>", ">{t('backtest.seoModelable')}</div>"],
  [">组合权重、日期范围、调仓计划、现金流、通胀、拖累及提款假设。</div>", ">{t('backtest.seoModelableDesc')}</div>"],
  [">可查看指标</div>", ">{t('backtest.seoViewable')}</div>"],
  [">CAGR、MWRR、波动率、最大回撤、夏普/索提诺/卡玛比率、滚动指标、季节性、相关性及退休提款统计。</div>", ">{t('backtest.seoViewableDesc')}</div>"],
  [">相关工具：</span>", ">{t('backtest.relatedTools')}</span>"],
];
processFile(bp, bpReplacements);

// ===== OptimizerPage.tsx =====
const op = 'd:/Project/回测平台/src/pages/OptimizerPage.tsx';
const opReplacements = [
  ["import { useState } from 'react';", "import { useState } from 'react';\nimport { useTranslation } from 'react-i18next';"],
  ["export default function OptimizerPage() {", "export default function OptimizerPage() {\n  const { t } = useTranslation();"],
  ["'请至少输入两个标的代码'", "t('optimizer.errorMinTwoTickers')"],
  ["'最小权重不能大于最大权重'", "t('optimizer.errorMinGtMax')"],
];
processFile(op, opReplacements);

// ===== DataEnginePage.tsx =====
const dep = 'd:/Project/回测平台/src/pages/DataEnginePage.tsx';
const depReplacements = [
  ["import { useState, useEffect, useRef } from 'react';", "import { useState, useEffect, useRef } from 'react';\nimport { useTranslation } from 'react-i18next';"],
  ["export default function DataEnginePage() {", "export default function DataEnginePage() {\n  const { t } = useTranslation();"],
  ["'连接中...'", "t('dataEngine.connecting')"],
  ["'扫描数据文件...'", "t('dataEngine.scanningFiles')"],
  ["'统计标的信息...'", "t('dataEngine.countingTickers')"],
  ["'生成报告...'", "t('dataEngine.generatingReport')"],
  ["'即将就绪...'", "t('dataEngine.almostReady')"],
  ["'鉴权失败：API Key 无效或缺失，请检查管理后台密钥配置'", "t('dataEngine.authFailed')"],
  ["'服务端错误，请确认后端服务已启动后重试'", "t('dataEngine.serverError')"],
  ["'数据加载失败，请重试'", "t('dataEngine.loadFailed')"],
  ["'连接超时，请确认后端服务已启动后重试'", "t('dataEngine.connectionTimeout')"],
  ["'服务端响应异常，请确认后端服务已启动后重试'", "t('dataEngine.serverAbnormal')"],
  ["'数据引擎加载超时，请确认后端服务已启动后重试'", "t('dataEngine.loadTimeout')"],
  ["'网络错误：无法连接到服务端，请确认后端服务已启动'", "t('dataEngine.networkError')"],
];
processFile(dep, depReplacements);

// ===== AnalysisPage.tsx =====
const ap = 'd:/Project/回测平台/src/pages/AnalysisPage.tsx';
const apReplacements = [
  ["import { useState, useMemo } from 'react';", "import { useState, useMemo } from 'react';\nimport { useTranslation } from 'react-i18next';"],
  // TABS
  ["{ key: 'summary', label: '概览' },", "{ key: 'summary', labelKey: 'tabs.summary' },"],
  ["{ key: 'telltale', label: '趋势图' },", "{ key: 'telltale', labelKey: 'tabs.telltale' },"],
  ["{ key: 'correlations', label: '相关性&Beta' },", "{ key: 'correlations', labelKey: 'tabs.correlationsBeta' },"],
  ["{ key: 'rolling', label: '滚动指标' },", "{ key: 'rolling', labelKey: 'tabs.rollingMetrics' },"],
  ["{ key: 'risk-return', label: '风险vs收益' },", "{ key: 'risk-return', labelKey: 'tabs.riskVsReturn' },"],
  ["{ key: 'returns', label: '收益' },", "{ key: 'returns', labelKey: 'tabs.returns' },"],
];
processFile(ap, apReplacements);

console.log('\nAll files processed.');
