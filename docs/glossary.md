# 金融术语表 (Glossary)

> 来源：`packages/frontend/src/lib/glossary.ts`（P4-3 未落地、零引用）迁移固化。供文档与未来 tooltip 参考。

| 英文术语                            | 中文                               | 计算/说明                                     |
| ----------------------------------- | ---------------------------------- | --------------------------------------------- |
| CAGR                                | 年化复合增长率                     | (End/Start)^(1/Years) - 1，复利               |
| MWRR / IRR                          | 资金加权收益率                     | 考虑资金流入流出时间的内部收益率              |
| Sharpe / Sortino                    | 夏普 / 索提诺比率                  | (Return-Rf)/StdDev / 仅下行偏差               |
| Calmar / Ulcer Index                | 卡尔玛 / 溃疡指数                  | 年化收益/最大回撤 / sqrt(mean(drawdown²))     |
| Beta / Alpha                        | 贝塔 / 阿尔法                      | 对基准敏感度 / 超额收益                       |
| Max Drawdown / Volatility           | 最大回撤 / 波动率                  | 峰谷最大跌幅 / 收益率标准差                   |
| Correlation / R-Squared             | 相关性 / 决定系数                  | 线性相关(-1~+1) / 可解释比例(0-1)             |
| StdDev / Downside Deviation         | 标准差 / 下行偏差                  | 离散度 / 仅负收益标准差                       |
| Tracking Error / Information Ratio  | 跟踪误差 / 信息比率                | 超额收益标准差 / 超额收益÷跟踪误差            |
| Treynor Ratio                       | 特雷诺比率                         | 每单位 Beta 超额收益                          |
| Rebalancing / Glide Path            | 再平衡 / 滑行路径                  | 权重调回目标 / 随时间调配置                   |
| Monte Carlo / Efficient Frontier    | 蒙特卡洛 / 有效前沿                | 随机抽样模拟 / 给定风险最优组合集             |
| Drawdown / Recovery Factor          | 回撤 / 恢复因子                    | 峰谷跌幅 / 恢复时间比                         |
| Tail Risk / VaR / CVaR              | 尾部风险 / 风险价值 / 条件风险价值 | 极端事件 / 置信水平最大损失 / VaR 外平均损失  |
| Skewness / Kurtosis                 | 偏度 / 峰度                        | 分布不对称 / 尾部厚度                         |
| Frontier Portfolio / Risk-Free Rate | 前沿组合 / 无风险利率              | 有效前沿最优组合 / 理论无风险收益（短期国债） |
