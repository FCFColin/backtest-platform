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

// ===== DataEnginePage.tsx =====
processFile('d:/Project/回测平台/src/pages/DataEnginePage.tsx', [
  // Title and headers
  ['>数据引擎</h1>', ">{t('dataEngine.title')}</h1>"],
  ['>数据引擎</h1></div>', ">{t('dataEngine.title')}</h1></div>"],

  // Loading/error state
  ["setLoadStage('就绪');", "setLoadStage(t('dataEngine.ready'));"],
  ["'数据引擎统计信息加载失败'", "t('dataEngine.statsLoadFailed')"],

  // Action buttons
  ['/> 刷新统计', "/> {t('dataEngine.refreshStats')}"],
  ["doAction('/api/data/manage/update/inc', '增量更新')", "doAction('/api/data/manage/update/inc', t('dataEngine.incrementalUpdate'))"],
  ['/> 增量更新', "/> {t('dataEngine.incrementalUpdate')}"],
  ["doAction('/api/data/manage/update/refetch', '重新获取')", "doAction('/api/data/manage/update/refetch', t('dataEngine.refetch'))"],
  ['/> 重新获取', "/> {t('dataEngine.refetch')}"],
  ["doAction('/api/data/manage/update/full', '全量更新')", "doAction('/api/data/manage/update/full', t('dataEngine.fullUpdate'))"],
  ['/> 全量更新', "/> {t('dataEngine.fullUpdate')}"],
  ["doAction('/api/data/manage/universe', '刷新宇宙')", "doAction('/api/data/manage/universe', t('dataEngine.refreshUniverse'))"],
  ['/> 刷新宇宙', "/> {t('dataEngine.refreshUniverse')}"],
  ['/> 重试', "/> {t('common.retry')}"],

  // StatCard labels
  ['label="标的宇宙"', "label={t('dataEngine.universeLabel')}"],
  ['label="数据点总数"', "label={t('dataEngine.totalDataPoints')}"],
  ['label="时间范围"', "label={t('dataEngine.timeRange')}"],
  ['label="磁盘占用"', "label={t('dataEngine.diskUsage')}"],

  // StatCard sub-text
  ['已缓存', "t('dataEngine.cached')"],
  ['平均', "t('dataEngine.avgPointsPerTicker').replace('Pts/Ticker', '')"],
  ['至', "t('dataEngine.to')"],
  ['个JSON文件', "t('dataEngine.jsonFiles')"],

  // Coverage section
  ['>数据覆盖率</div>', ">{t('dataEngine.dataCoverage')}</div>"],
  ['label="总覆盖率"', "label={t('dataEngine.totalCoverage')}"],
  ['label="5年以上数据"', "label={t('dataEngine.fiveYearsPlus')}"],
  ['label="10年以上数据"', "label={t('dataEngine.tenYearsPlus')}"],
  ['label="20年以上数据"', "label={t('dataEngine.twentyYearsPlus')}"],
  ['label="后复权数据"', "label={t('dataEngine.adjCloseData')}"],
  ['label="含分红数据"', "label={t('dataEngine.dividendData')}"],

  // Market distribution
  ['>按市场分布</div>', ">{t('dataEngine.byMarket')}</div>"],
  ["'美股' : market === 'CN' ? 'A股' : market", "t('dataEngine.usStock') : market === 'CN' ? t('dataEngine.cnStock') : market"],
  ['股票 {data.stocks}', "t('dataEngine.stock') {data.stocks}"],
  ['ETF {data.etfs}', "t('dataEngine.etf') {data.etfs}"],
  ['指数 {data.indices}', "t('dataEngine.index') {data.indices}"],
  ['>宇宙 vs 缓存</div>', ">{t('dataEngine.universeVsCache')}</div>"],
  ['美股:', "t('dataEngine.usStocks'):"],
  ['已缓存', "t('dataEngine.cached')"],
  ['A股:', "t('dataEngine.cnStocks'):"],

  // Exchange distribution
  ['>按交易所分布 (Top 10)</div>', ">{t('dataEngine.byExchange')}</div>"],
  ["'未知'", "t('dataEngine.unknown')"],

  // Decade distribution
  ['>数据起始年代分布</div>', ">{t('dataEngine.byDecade')}</div>"],
  ['>数据年限分布</div>', ">{t('dataEngine.byYearCount')}</div>"],

  // Sample tickers
  ['>样本标的</div>', ">{t('dataEngine.sampleTickers')}</div>"],
  ["us_stock: '美股股票', us_etf: '美股ETF', cn_stock: 'A股股票', cn_etf: 'A股ETF', index: '指数'", "us_stock: t('dataEngine.usStockCategory'), us_etf: t('dataEngine.usEtfCategory'), cn_stock: t('dataEngine.cnStockCategory'), cn_etf: t('dataEngine.cnEtfCategory'), index: t('dataEngine.indexCategory')"],
  ['天)', "t('common.days'))"],

  // Recent updates
  ['>最近更新</div>', ">{t('dataEngine.recentUpdates')}</div>"],

  // Data quality
  ['>数据质量</div>', ">{t('dataEngine.dataQuality')}</div>"],
  ['label="后复权价格"', "label={t('dataEngine.adjClosePrice')}"],
  ['label="含分红数据"', "label={t('dataEngine.withDividends')}"],
  ['label="含拆股数据"', "label={t('dataEngine.withSplits')}"],
  ['label="中位数数据点"', "label={t('dataEngine.medianDataPoints')}"],

  // Universe info
  ['标的宇宙上次刷新:', "t('dataEngine.universeLastRefresh'):"],
  ["'未刷新'", "t('dataEngine.notRefreshed')"],
  ['个标的', "t('dataEngine.totalTickers')"],
  ['股票', "t('dataEngine.stock')"],
  ['指数', "t('dataEngine.index')"],
  ['美股', "t('dataEngine.usStocks')"],
  ['A股', "t('dataEngine.cnStocks')"],

  // doAction label formatting
  ["`${label}中...`", "`${label}...`"],
  ["`${label}已触发`", "`${label} ✓`"],
  ["`失败: ${json.error}`", "t('common.error')"],
  ["`${label}请求失败`", "t('common.error')"],
]);

// ===== AnalysisPage.tsx =====
processFile('d:/Project/回测平台/src/pages/AnalysisPage.tsx', [
  // Add useTranslation to main component
  ['export default function AnalysisPage() {', 'export default function AnalysisPage() {\n  const { t } = useTranslation();'],

  // Title
  ['>资产分析</h1>', ">{t('analysis.title')}</h1>"],

  // SEO text
  ['资产分析工具帮助您使用与回测模块相同的数据和日期规则，比较一个或多个标的的总回报、回撤、波动率、相关性及不同市场环境下的表现。', "{t('analysis.seoDesc')}"],
  ['>可分析内容</div>', ">{t('analysis.seoAnalyzable')}</div>"],
  ['>ETF、基金、股票的增长曲线、回撤曲线、滚动收益、相关性矩阵及关键统计指标。</div>', ">{t('analysis.seoAnalyzableDesc')}</div>"],
  ['>可查看指标</div>', ">{t('analysis.seoViewable')}</div>"],
  ['>年化收益(CAGR)、标准差、夏普比率、最大回撤、滚动窗口收益、相关性系数。</div>', ">{t('analysis.seoViewableDesc')}</div>"],
  ['>相关工具：</span>', ">{t('analysis.relatedTools')}</span>"],

  // Params section labels
  ['title="标的列表"', "title={t('analysis.tickerList')}"],
  ['info="添加一个或多个标的代码（如 ETF、股票）进行比较分析"', "info={t('analysis.tickerListInfo')}"],
  ['placeholder="输入代码，如 SPY"', "placeholder={t('analysis.tickerPlaceholder')}"],
  ['添加标的\n          </button>', "{t('analysis.addAsset')}\n          </button>"],
  ['title="时间范围"', "title={t('analysis.timeRange')}"],
  ['<span className="param-label">开始日期</span>', '<span className="param-label">{t(\'analysis.startDate\')}</span>'],
  ['<span className="param-label">结束日期</span>', '<span className="param-label">{t(\'analysis.endDate\')}</span>'],
  ['<span className="param-label">初始资金</span>', '<span className="param-label">{t(\'analysis.startingValue\')}</span>'],
  ['title="分析设置"', "title={t('analysis.analysisSettings')}"],
  ['<span className="param-label">滚动窗口</span>', '<span className="param-label">{t(\'analysis.rollingWindow\')}</span>'],
  ['<span className="param-label">相关窗口</span>', '<span className="param-label">{t(\'analysis.correlationWindow\')}</span>'],
  ['<span>调整通胀（CPI）</span>', "<span>{t('analysis.adjustInflation')}</span>"],

  // Error message
  ["'请至少输入一个标的代码'", "t('analysis.errorMinOneTicker')"],

  // Run button
  ["'分析中...' : '开始分析'", "t('analysis.analyzing') : t('analysis.startAnalysis')"],
  ["'分析失败'", "t('analysis.analysisFailed')"],

  // No results hint
  ['设置参数后点击「开始分析」查看结果', "{t('analysis.noResultsHint')}"],

  // Chart titles
  ['>统计概览</div>', ">{t('analysis.statsOverview')}</div>"],
  ['>增长曲线</div>', ">{t('analysis.growthCurve')}</div>"],
  ['>回撤</div>', ">{t('analysis.drawdown')}</div>"],
  ['>相关性矩阵</div>', ">{t('analysis.correlationMatrix')}</div>"],
  ['>述事图 (Telltale)</div>', ">{t('analysis.telltaleChart')}</div>"],
  ['需要至少2个资产才能显示述事图', "{t('analysis.telltaleNeedTwo')}"],
  ['>述事图 (Telltale) — 相对</div>', ">{t('analysis.telltaleRelative')}</div>"],
  ['相对比率', "t('analysis.relativeRatio')"],
  ['>Beta 矩阵</div>', ">{t('analysis.betaMatrix')}</div>"],
  ['>滚动相关性</div>', ">{t('analysis.rollingCorrelation')}</div>"],
  ['相关性', "t('analysis.correlation')"],
  ['>滚动 CAGR</div>', ">{t('analysis.rollingCAGR')}</div>"],
  ['>滚动波动率</div>', ">{t('analysis.rollingVolatility')}</div>"],
  ['>滚动超额收益</div>', ">{t('analysis.rollingExcess')}</div>"],
  ['>滚动偏度</div>', ">{t('analysis.rollingSkewness')}</div>"],
  ['>滚动峰度</div>', ">{t('analysis.rollingKurtosis')}</div>"],
  ['>滚动 Kelly</div>', ">{t('analysis.rollingKelly')}</div>"],
  ['>风险 vs 收益</div>', ">{t('analysis.riskVsReturn')}</div>"],
  ['风险', "t('analysis.risk')"],
  ['>年度收益</div>', ">{t('analysis.annualReturns')}</div>"],
  ['>月度收益热力图</div>', ">{t('analysis.monthlyReturnsHeatmap')}</div>"],
  ['>最长回撤</div>', ">{t('analysis.maxDrawdownDuration')}</div>"],
  ['加载中...', "{t('common.loading')}"],

  // Stats table labels
  ['最大回撤', "t('backtest.maxDrawdown')"],
  ['平均回撤', "t('optimizer.maxDrawdownLT').replace(' <', '')"],
  ['波动率', "t('backtest.stdev')"],
  ['夏普', "t('backtest.sharpeRatio')"],
]);

console.log('\nAll DataEngine + Analysis replacements done.');
