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
  '#3b82f6', // 蓝色
  '#14b8a6', // 蓝绿色
  '#f59e0b', // 琥珀
  '#ef4444', // 红
  '#8b5cf6', // 紫
  '#ec4899', // 粉
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

/**
 * 各再平衡频率对应的中文展示标签
 *
 * 各页面在渲染下拉选项、表格列、图例时基于此派生 label，避免在多处重复维护
 * 同一份中文标签映射。i18n 场景（如 tactical 页）仍可使用各自的 i18n key 数组，
 * 不强制走此处的中文文本。
 */
export const REBALANCE_LABELS: Record<RebalanceFrequency, string> = {
  daily: '每日',
  weekly: '每周',
  monthly: '每月',
  quarterly: '每季度',
  annual: '每年',
  none: '不调仓',
  threshold: '阈值',
};

/**
 * 再平衡频率下拉选项（value + 中文 label），基于 REBALANCE_FREQUENCIES 派生
 *
 * 适用于不需要 i18n 切换、或仅展示中文 label 的场景（如 backtest-optimizer 表格）。
 * tactical 系列页面若需 i18n key 形式的 label，仍需保留各自本地常量。
 */
export const REBALANCE_FREQUENCY_OPTIONS: Array<{ value: RebalanceFrequency; label: string }> =
  REBALANCE_FREQUENCIES.map((value) => ({ value, label: REBALANCE_LABELS[value] }));
