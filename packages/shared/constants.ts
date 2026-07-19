// 共享常量

import type { RebalanceFrequency } from './types/portfolio.js';

/**
 * 全局常量定义
 *
 * 提取魔法数字为具名常量，提升可读性和可维护性。
 */

/** 单次请求最大标的数量 */
export const MAX_TICKERS = 50;

/** 一年交易日数（A股/美股均按 252 计） */
export const TRADING_DAYS_PER_YEAR = 252;

/** 图表颜色色板 */
export const CHART_COLORS = [
  '#2b63b8', // 品牌蓝
  '#f97316', // 橙
  '#2e8b57', // 绿
  '#c94a4a', // 红
  '#a855f7', // 紫
  '#06b6d4', // 青
] as const;

/**
 * 核心再平衡频率值（不含 none/threshold 等特殊值）
 *
 * 各页面在渲染选项下拉、热力图、表格时基于此派生 label（中文或 i18n key），
 * 避免在多处重复维护频率值列表。
 */
export const REBALANCE_FREQUENCIES = [
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'annual',
] as const satisfies readonly RebalanceFrequency[];

/** 所有 RebalanceFrequency 值（含特殊值 none/threshold） */
export const ALL_REBALANCE_FREQUENCIES = [
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'annual',
  'none',
  'threshold',
] as const satisfies readonly RebalanceFrequency[];

/** 各再平衡频率对应的展示色（用于图表/选项标识，保持跨页面一致） */
export const REBALANCE_FREQUENCY_COLORS: Record<RebalanceFrequency, string> = {
  daily: '#2b63b8',
  weekly: '#06b6d4',
  monthly: '#2e8b57',
  quarterly: '#f97316',
  annual: '#c94a4a',
  none: '#94a3b8',
  threshold: '#a855f7',
};
