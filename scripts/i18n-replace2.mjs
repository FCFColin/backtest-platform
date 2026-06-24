import fs from 'fs';

function processFile(filePath, replacements) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = 0;
  for (const [oldStr, newStr] of replacements) {
    if (content.includes(oldStr)) {
      content = content.replaceAll(oldStr, newStr);
      changed++;
    } else {
      console.warn(`  SKIP: ${oldStr.substring(0, 50)}...`);
    }
  }
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`OK: ${filePath} (${changed} replacements)`);
}

// ===== OptimizerPage.tsx =====
processFile('d:/Project/回测平台/src/pages/OptimizerPage.tsx', [
  // Already has useTranslation import and t() from first pass
  // Now replace remaining hardcoded text
  ["'优化失败'", "t('optimizer.optFailed')"],
  ["name: '最优组合',\n            assets:", "name: t('optimizer.optimalPortfolio'),\n            assets:"],
  ["name: '最优组合',\n        assets:", "name: t('optimizer.optimalPortfolio'),\n        assets:"],
  ["{ key: 'cagr', label: 'CAGR', fmt: 'pct' },", "{ key: 'cagr', label: 'CAGR', fmt: 'pct' },"],  // keep CAGR as is
  ["label: '波动率', fmt: 'pct'", "label: t('optimizer.volatilityLT').replace(' <', ''), fmt: 'pct'"],
  ["label: '最大回撤', fmt: 'pct'", "label: t('backtest.maxDrawdown'), fmt: 'pct'"],
  ["label: '平均回撤', fmt: 'pct'", "label: t('optimizer.maxDrawdownLT').replace(' <', ''), fmt: 'pct'"],
  ["label: '夏普比率', fmt: 'num'", "label: t('backtest.sharpeRatio'), fmt: 'num'"],
  ['title="资产选择"', "title={t('optimizer.assetSelection')}"],
  ['info="输入参与优化的标的代码，至少需要两个"', "info={t('optimizer.assetSelectionInfo')}"],
  ['placeholder="输入代码，如 VTI"', "placeholder={t('optimizer.tickerPlaceholder')}"],
  ['添加标的\n          </button>', "{t('optimizer.addAsset')}\n          </button>"],
  ['title="删除"', "title={t('common.delete')}"],
  ['title="基本参数"', "title={t('optimizer.basicParams')}"],
  ['info="设置优化目标、权重限制与求解器"', "info={t('optimizer.basicParamsInfo')}"],
  ['<span>全部历史</span>', "<span>{t('optimizer.allHistory')}</span>"],
  ['<span className="param-label">开始日期</span>', '<span className="param-label">{t(\'optimizer.startDate\')}</span>'],
  ['<span className="param-label">结束日期</span>', '<span className="param-label">{t(\'optimizer.endDate\')}</span>'],
  ['<span className="param-label">优化目标</span>', '<span className="param-label">{t(\'optimizer.objective\')}</span>'],
  ['<option value="maxSharpe">最大化夏普比</option>', "<option value=\"maxSharpe\">{t('optimizer.maxSharpe')}</option>"],
  ['<option value="minVolatility">最小化波动率</option>', "<option value=\"minVolatility\">{t('optimizer.minVolatility')}</option>"],
  ['<option value="maxReturn">最大化收益</option>', "<option value=\"maxReturn\">{t('optimizer.maxReturn')}</option>"],
  ['<span className="param-label">最小权重</span>', '<span className="param-label">{t(\'optimizer.minWeight\')}</span>'],
  ['<span className="param-label">最大权重</span>', '<span className="param-label">{t(\'optimizer.maxWeight\')}</span>'],
  ['<span className="param-label">T-Bill利率</span>', '<span className="param-label">{t(\'optimizer.tbillRate\')}</span>'],
  ['<span className="param-label">求解器</span>', '<span className="param-label">{t(\'optimizer.solver\')}</span>'],
  ['<option value="markowitz">Markowitz</option>', "<option value=\"markowitz\">{t('optimizer.solverMarkowitz')}</option>"],
  ['<option value="ga">遗传算法(GA)</option>', "<option value=\"ga\">{t('optimizer.solverGA')}</option>"],
  ['<span>允许做空</span>', "<span>{t('optimizer.allowShort')}</span>"],
  ['title="历史约束优化"', "title={t('optimizer.historicalConstraints')}"],
  ['info="基于历史回测指标的过滤条件，启用后仅返回满足约束的组合"', "info={t('optimizer.historicalConstraintsInfo')}"],
  ['<span>最大回撤 &lt;</span>', "<span>{t('optimizer.maxDrawdownLT')}</span>"],
  ['<span>CAGR &gt;</span>', "<span>{t('optimizer.cagrGT')}</span>"],
  ['<span>波动率 &lt;</span>', "<span>{t('optimizer.volatilityLT')}</span>"],
  ['title="高级约束"', "title={t('optimizer.advancedConstraints')}"],
  ['info="其他历史指标约束与持仓限制，留空表示不限制"', "info={t('optimizer.advancedConstraintsInfo')}"],
  ['<span className="param-label">最大持仓数</span>', '<span className="param-label">{t(\'optimizer.maxHoldings\')}</span>'],
  ['<span className="param-label">最小包含权重</span>', '<span className="param-label">{t(\'optimizer.minWeightToInclude\')}</span>'],
  ["'正在计算回测统计...' : isLoading ? '优化中...' : '开始计算'", "t('optimizer.calculatingStats') : isLoading ? t('optimizer.optimizing') : t('optimizer.startCalc')"],
  ['优化失败：{error}', "{t('optimizer.optFailed')}：{error}"],
  ['配置左侧参数并点击「开始计算」查看最优权重', "{t('optimizer.noResultsHint')}"],
  ['>最优权重</div>', ">{t('optimizer.optimalWeights')}</div>"],
  ['Load in backtester\n          </button>', "{t('optimizer.loadInBacktester')}\n          </button>"],
  ['>Optimal Portfolio Metrics</div>', ">{t('optimizer.optimalMetrics')}</div>"],
  ['>指标\n                </th>', ">{t('common.metric')}\n                </th>"],
  ['>最优组合\n                </th>', ">{t('optimizer.optimalPortfolio')}\n                </th>"],
  ['>有效前沿</div>', ">{t('optimizer.efficientFrontier')}</div>"],
  ["value: '波动率 (%)'", "value: t('optimizer.volatilityAxis')"],
  ["value: '收益率 (%)'", "value: t('optimizer.returnAxis')"],
  ['>约束条件</div>', ">{t('optimizer.constraintsSummary')}</div>"],
  ['>最小权重</div>', ">{t('optimizer.minWeight')}</div>"],
  ['>最大权重</div>', ">{t('optimizer.maxWeight')}</div>"],
  ['>T-Bill利率</div>', ">{t('optimizer.tbillRate')}</div>"],
  ['>允许做空</div>', ">{t('optimizer.allowShort')}</div>"],
  ["{allowShort ? '是' : '否'}</div>", "{allowShort ? t('common.yes') : t('common.no')}</div>"],
  ['>最大持仓数</div>', ">{t('optimizer.maxHoldings')}</div>"],
  ['>最小包含权重</div>', ">{t('optimizer.minWeightToInclude')}</div>"],
  ['>求解器</div>', ">{t('optimizer.solver')}</div>"],
  ['>组合优化</h1>', ">{t('optimizer.title')}</h1>"],
  ['组合优化工具帮助您搜索最优资产配置，而非手动试错。输入一组标的代码，设定权重限制，选择优化目标，让系统为您搜索最符合历史数据和约束条件的组合。', "{t('optimizer.seoDesc')}"],
  ['>优化目标</div>', ">{t('optimizer.seoObjective')}</div>"],
  ['>最大化夏普比率、最小化波动率、最大化收益，并支持多约束条件、做空、持仓数限制与遗传算法求解。</div>', ">{t('optimizer.seoObjectiveDesc')}</div>"],
  ['>输出结果</div>', ">{t('optimizer.seoOutput')}</div>"],
  ['>最优权重分配、预期收益率、预期波动率、夏普比率，以及有效前沿散点图与约束条件汇总。</div>', ">{t('optimizer.seoOutputDesc')}</div>"],
  ['>相关工具：</span>', ">{t('optimizer.relatedTools')}</span>"],
  ['>组合回测</Link>', ">{t('nav.portfolioBacktest')}</Link>"],
  ['>有效前沿</Link>', ">{t('nav.efficientFrontier')}</Link>"],
  ['>资产分析</Link>', ">{t('nav.assetAnalysis')}</Link>"],
  ['>蒙特卡洛模拟</Link>', ">{t('nav.monteCarlo')}</Link>"],
  ['title="参数设置"', "title={t('params.title')}"],
]);

// ===== DataEnginePage.tsx =====
processFile('d:/Project/回测平台/src/pages/DataEnginePage.tsx', [
  // Already has useTranslation import and basic t() from first pass
  // Now replace remaining hardcoded text in the JSX
  ["'连接中...'", "t('dataEngine.connecting')"],
  ["return '连接中...';", "return t('dataEngine.connecting');"],
  ["return '扫描数据文件...';", "return t('dataEngine.scanningFiles');"],
  ["return '统计标的信息...';", "return t('dataEngine.countingTickers');"],
  ["return '生成报告...';", "return t('dataEngine.generatingReport');"],
  ["return '即将就绪...';", "return t('dataEngine.almostReady');"],
]);

// ===== AnalysisPage.tsx =====
processFile('d:/Project/回测平台/src/pages/AnalysisPage.tsx', [
  // Already has useTranslation import and TABS label keys from first pass
  // Now fix the TABS usage in JSX: {tab.label} -> {t(tab.labelKey)}
  ['{tab.label}', '{t(tab.labelKey)}'],
]);

console.log('\nAll additional replacements done.');
