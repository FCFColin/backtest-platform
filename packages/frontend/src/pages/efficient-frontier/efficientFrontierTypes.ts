/**
 * @file 有效前沿页面共享类型
 * @description 集中定义有效前沿参数表单与状态管理共用的事件/枚举类型，避免在多个文件重复定义
 */

/** 求解速度档位，控制有效前沿采样密度与求解耗时 */
export type SolveSpeed = 'ultrafast' | 'fast' | 'medium' | 'slow';

/** 有效前沿求解器：Markowitz 解析解或 NSGA-II 多目标进化算法 */
export type FrontierSolver = 'markowitz' | 'nsga2';

/** 收益目标：最大化年化收益率或最小化波动率 */
export type ReturnObjective = 'maxCagr' | 'minVolatility';
