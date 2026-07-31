# 金融术语表 (Glossary)

> 来源：从 `packages/frontend/src/lib/glossary.ts`（P4-3 未落地、零引用）迁移固化。
> 用途：金融术语中英对照 + 计算说明，供文档与未来 tooltip 实现参考。

| 英文术语               | 中文术语       | 中文说明                                            | 英文说明                                                                | 计算/应用说明                           |
| ---------------------- | -------------- | --------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------- |
| CAGR                   | 年化复合增长率 | 投资在特定时期内的年均增长率，考虑复利效应。        | Compound Annual Growth Rate - the annualized return rate over a period. | (End Value / Start Value)^(1/Years) - 1 |
| MWRR                   | 资金加权收益率 | 考虑资金流入流出时间的收益率，即内部收益率（IRR）。 | Money-Weighted Rate of Return, equivalent to IRR.                       | —                                       |
| Sharpe Ratio           | 夏普比率       | 每单位风险（标准差）获得的超额收益。                | Excess return per unit of risk (standard deviation).                    | (Return - Risk-Free) / StdDev           |
| Sortino Ratio          | 索提诺比率     | 只考虑下行风险（负收益的标准差）的夏普比率变体。    | Sharpe variant using only downside deviation.                           | —                                       |
| Calmar Ratio           | 卡尔玛比率     | 年化收益与最大回撤的比率。                          | Annual return divided by maximum drawdown.                              | —                                       |
| Ulcer Index            | 溃疡指数       | 衡量回撤深度和持续时间的风险指标。                  | Risk metric measuring drawdown depth and duration.                      | sqrt(mean(drawdown^2))                  |
| Beta                   | 贝塔系数       | 标的相对于基准的波动性。                            | Sensitivity of an asset to market movements.                            | —                                       |
| Alpha                  | 阿尔法         | 超过市场基准的超额收益。                            | Excess return above the benchmark.                                      | —                                       |
| Max Drawdown           | 最大回撤       | 从峰值到谷值的最大跌幅。                            | Maximum peak-to-trough decline.                                         | —                                       |
| Volatility             | 波动率         | 收益率的标准差，衡量价格波动程度。                  | Standard deviation of returns.                                          | —                                       |
| Correlation            | 相关性         | 两个资产收益率的相关程度 (-1 到 +1)。               | Degree of linear relationship between two assets (-1 to +1).            | —                                       |
| R-Squared              | 决定系数       | 基准收益可解释的比例 (0-1)。                        | Proportion of variance explained by benchmark (0-1).                    | —                                       |
| Standard Deviation     | 标准差         | 收益率离散程度的统计度量。                          | Statistical measure of return dispersion.                               | —                                       |
| Downside Deviation     | 下行偏差       | 仅考虑负收益的标准差。                              | Standard deviation of negative returns only.                            | —                                       |
| Tracking Error         | 跟踪误差       | 组合收益与基准收益的差异标准差。                    | Standard deviation of excess returns vs benchmark.                      | —                                       |
| Information Ratio      | 信息比率       | 超额收益除以跟踪误差。                              | Excess return per unit of tracking error.                               | —                                       |
| Treynor Ratio          | 特雷诺比率     | 每单位 Beta 的超额收益。                            | Excess return per unit of Beta.                                         | —                                       |
| Rebalancing            | 再平衡         | 定期调整组合权重回到目标配置。                      | Periodic adjustment of portfolio weights.                               | —                                       |
| Glide Path             | 滑行路径       | 随时间推移逐步调整资产配置的策略。                  | Progressive asset allocation adjustment over time.                      | —                                       |
| Monte Carlo            | 蒙特卡洛模拟   | 通过随机抽样模拟未来路径的概率方法。                | Probabilistic simulation via random sampling.                           | —                                       |
| Efficient Frontier     | 有效前沿       | 给定风险水平下最大收益的组合集合。                  | Set of optimal portfolios for given risk levels.                        | —                                       |
| Drawdown               | 回撤           | 从峰值下跌的幅度。                                  | Decline from a peak value.                                              | —                                       |
| Recovery Factor        | 恢复因子       | 恢复时间与跌至谷底时间的比率。                      | Ratio of recovery time to time-to-trough.                               | —                                       |
| Tail Risk              | 尾部风险       | 极端市场事件的风险。                                | Risk of extreme market events.                                          | —                                       |
| Value at Risk (VaR)    | 风险价值       | 在给定置信水平下的最大预期损失。                    | Maximum expected loss at a given confidence level.                      | —                                       |
| Conditional VaR (CVaR) | 条件风险价值   | 超过 VaR 阈值后的平均损失。                         | Average loss beyond VaR threshold.                                      | —                                       |
| Skewness               | 偏度           | 收益率分布的不对称性。                              | Asymmetry of return distribution.                                       | —                                       |
| Kurtosis               | 峰度           | 收益率分布的尾部厚度。                              | Tail thickness of return distribution.                                  | —                                       |
| Frontier Portfolio     | 前沿组合       | 有效前沿上的最优组合。                              | Optimal portfolio on the efficient frontier.                            | —                                       |
| Risk-Free Rate         | 无风险利率     | 理论上无违约风险的收益率，通常用短期国债。          | Theoretical zero-default return, typically T-bill yield.                | —                                       |
