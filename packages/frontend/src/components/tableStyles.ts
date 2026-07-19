/**
 * @file 表格样式共享常量
 * @description 集中管理跨组件重复的表格单元格 className 与 inline style，
 *              避免在 FactorRegressionResults / CashflowsLog / RegressionChart /
 *              RebalancingStats / TacticalTables 等多处重复定义。
 */
import type { CSSProperties } from 'react';

/** 表头单元格基础 className（与 TABLE_TH_STYLE 搭配使用） */
export const TABLE_TH_CLASS = 'text-[12px] font-semibold py-2.5 px-3';

/** 表头单元格 inline style：muted 文本色 + 双线下边框 */
export const TABLE_TH_STYLE: CSSProperties = {
  color: 'var(--text-muted)',
  borderBottom: '2px solid var(--border-soft)',
};

/** 数据单元格基础 className（与 TABLE_TD_STYLE 或 TABLE_TD_BORDER 搭配使用） */
export const TABLE_TD_CLASS = 'text-[13px] py-2 px-3';

/** 数据单元格 inline style：body 文本色 + 单线下边框 */
export const TABLE_TD_STYLE: CSSProperties = {
  color: 'var(--text-body)',
  borderBottom: '1px solid var(--border-soft)',
};

/** 仅含下边框的单元格 style，调用方 spread 后追加自定义 color 等字段 */
export const TABLE_TD_BORDER: CSSProperties = {
  borderBottom: '1px solid var(--border-soft)',
};
