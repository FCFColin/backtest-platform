// 共享常量

/**
 * 全局常量定义
 *
 * Code Quality: 提取魔法数字为具名常量，提升可读性和可维护性
 * 企业为何需要：魔法数字是技术债的典型来源，修改时需全局搜索替换，易遗漏
 * 权衡：常量文件可能过度集中，但比散落各处的魔法数字更易维护
 */

/** 单次请求最大标的数量 */
export const MAX_TICKERS = 50;

/** 一年交易日数（A股） */
export const TRADING_DAYS_PER_YEAR = 252;

/** 一年交易日数（美股） */
export const TRADING_DAYS_PER_YEAR_US = 252;

/** 图表颜色色板 */
export const CHART_COLORS = [
  '#2b63b8', // 品牌蓝
  '#f97316', // 橙
  '#2e8b57', // 绿
  '#c94a4a', // 红
  '#a855f7', // 紫
  '#06b6d4', // 青
] as const;
