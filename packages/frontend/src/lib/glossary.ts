/**
 * @file 金融术语表 (Glossary)
 * @description P4-3: 金融术语中英对照 + tooltip 说明。
 *   所有金融术语首次出现时应加 tooltip 说明。
 */

export interface GlossaryTerm {
  /** 英文术语 */
  en: string;
  /** 中文术语 */
  zh: string;
  /** 简短说明（中文） */
  descriptionZh: string;
  /** 简短说明（英文） */
  descriptionEn: string;
  /** 计算/应用说明 */
  formula?: string;
}

/** 30+ 金融术语中英对照表 */
export const GLOSSARY: GlossaryTerm[] = [
  {
    en: 'CAGR',
    zh: '年化复合增长率',
    descriptionZh: '投资在特定时期内的年均增长率，考虑复利效应。',
    descriptionEn: 'Compound Annual Growth Rate - the annualized return rate over a period.',
    formula: '(End Value / Start Value)^(1/Years) - 1',
  },
  {
    en: 'MWRR',
    zh: '资金加权收益率',
    descriptionZh: '考虑资金流入流出时间的收益率，即内部收益率（IRR）。',
    descriptionEn: 'Money-Weighted Rate of Return, equivalent to IRR.',
  },
  {
    en: 'Sharpe Ratio',
    zh: '夏普比率',
    descriptionZh: '每单位风险（标准差）获得的超额收益。',
    descriptionEn: 'Excess return per unit of risk (standard deviation).',
    formula: '(Return - Risk-Free) / StdDev',
  },
  {
    en: 'Sortino Ratio',
    zh: '索提诺比率',
    descriptionZh: '只考虑下行风险（负收益的标准差）的夏普比率变体。',
    descriptionEn: 'Sharpe variant using only downside deviation.',
  },
  {
    en: 'Calmar Ratio',
    zh: '卡尔玛比率',
    descriptionZh: '年化收益与最大回撤的比率。',
    descriptionEn: 'Annual return divided by maximum drawdown.',
  },
  {
    en: 'Ulcer Index',
    zh: '溃疡指数',
    descriptionZh: '衡量回撤深度和持续时间的风险指标。',
    descriptionEn: 'Risk metric measuring drawdown depth and duration.',
    formula: 'sqrt(mean(drawdown^2))',
  },
  {
    en: 'Beta',
    zh: '贝塔系数',
    descriptionZh: '标的相对于基准的波动性。',
    descriptionEn: 'Sensitivity of an asset to market movements.',
  },
  {
    en: 'Alpha',
    zh: '阿尔法',
    descriptionZh: '超过市场基准的超额收益。',
    descriptionEn: 'Excess return above the benchmark.',
  },
  {
    en: 'Max Drawdown',
    zh: '最大回撤',
    descriptionZh: '从峰值到谷值的最大跌幅。',
    descriptionEn: 'Maximum peak-to-trough decline.',
  },
  {
    en: 'Volatility',
    zh: '波动率',
    descriptionZh: '收益率的标准差，衡量价格波动程度。',
    descriptionEn: 'Standard deviation of returns.',
  },
  {
    en: 'Correlation',
    zh: '相关性',
    descriptionZh: '两个资产收益率的相关程度 (-1 到 +1)。',
    descriptionEn: 'Degree of linear relationship between two assets (-1 to +1).',
  },
  {
    en: 'R-Squared',
    zh: '决定系数',
    descriptionZh: '基准收益可解释的比例 (0-1)。',
    descriptionEn: 'Proportion of variance explained by benchmark (0-1).',
  },
  {
    en: 'Standard Deviation',
    zh: '标准差',
    descriptionZh: '收益率离散程度的统计度量。',
    descriptionEn: 'Statistical measure of return dispersion.',
  },
  {
    en: 'Downside Deviation',
    zh: '下行偏差',
    descriptionZh: '仅考虑负收益的标准差。',
    descriptionEn: 'Standard deviation of negative returns only.',
  },
  {
    en: 'Tracking Error',
    zh: '跟踪误差',
    descriptionZh: '组合收益与基准收益的差异标准差。',
    descriptionEn: 'Standard deviation of excess returns vs benchmark.',
  },
  {
    en: 'Information Ratio',
    zh: '信息比率',
    descriptionZh: '超额收益除以跟踪误差。',
    descriptionEn: 'Excess return per unit of tracking error.',
  },
  {
    en: 'Treynor Ratio',
    zh: '特雷诺比率',
    descriptionZh: '每单位 Beta 的超额收益。',
    descriptionEn: 'Excess return per unit of Beta.',
  },
  {
    en: 'Rebalancing',
    zh: '再平衡',
    descriptionZh: '定期调整组合权重回到目标配置。',
    descriptionEn: 'Periodic adjustment of portfolio weights.',
  },
  {
    en: 'Glide Path',
    zh: '滑行路径',
    descriptionZh: '随时间推移逐步调整资产配置的策略。',
    descriptionEn: 'Progressive asset allocation adjustment over time.',
  },
  {
    en: 'Monte Carlo',
    zh: '蒙特卡洛模拟',
    descriptionZh: '通过随机抽样模拟未来路径的概率方法。',
    descriptionEn: 'Probabilistic simulation via random sampling.',
  },
  {
    en: 'Efficient Frontier',
    zh: '有效前沿',
    descriptionZh: '给定风险水平下最大收益的组合集合。',
    descriptionEn: 'Set of optimal portfolios for given risk levels.',
  },
  {
    en: 'Drawdown',
    zh: '回撤',
    descriptionZh: '从峰值下跌的幅度。',
    descriptionEn: 'Decline from a peak value.',
  },
  {
    en: 'Recovery Factor',
    zh: '恢复因子',
    descriptionZh: '恢复时间与跌至谷底时间的比率。',
    descriptionEn: 'Ratio of recovery time to time-to-trough.',
  },
  {
    en: 'Tail Risk',
    zh: '尾部风险',
    descriptionZh: '极端市场事件的风险。',
    descriptionEn: 'Risk of extreme market events.',
  },
  {
    en: 'Value at Risk (VaR)',
    zh: '风险价值',
    descriptionZh: '在给定置信水平下的最大预期损失。',
    descriptionEn: 'Maximum expected loss at a given confidence level.',
  },
  {
    en: 'Conditional VaR (CVaR)',
    zh: '条件风险价值',
    descriptionZh: '超过 VaR 阈值后的平均损失。',
    descriptionEn: 'Average loss beyond VaR threshold.',
  },
  {
    en: 'Skewness',
    zh: '偏度',
    descriptionZh: '收益率分布的不对称性。',
    descriptionEn: 'Asymmetry of return distribution.',
  },
  {
    en: 'Kurtosis',
    zh: '峰度',
    descriptionZh: '收益率分布的尾部厚度。',
    descriptionEn: 'Tail thickness of return distribution.',
  },
  {
    en: 'Frontier Portfolio',
    zh: '前沿组合',
    descriptionZh: '有效前沿上的最优组合。',
    descriptionEn: 'Optimal portfolio on the efficient frontier.',
  },
  {
    en: 'Risk-Free Rate',
    zh: '无风险利率',
    descriptionZh: '理论上无违约风险的收益率，通常用短期国债。',
    descriptionEn: 'Theoretical zero-default return, typically T-bill yield.',
  },
];

/** 根据英文术语查找术语定义 */
export function findGlossaryTerm(en: string): GlossaryTerm | undefined {
  return GLOSSARY.find((t) => t.en.toLowerCase() === en.toLowerCase());
}
