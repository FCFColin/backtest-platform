/**
 * @file 表格样式共享常量
 * @description 集中管理跨组件重复的表格单元格 className，
 *   统一使用 token 类名（表头 bg-elevated/text-fg-tertiary，单元格 text-body/text-fg，
 *   数字列 tabular-nums font-mono）。
 */
import type { CSSProperties } from 'react';

/** 表头单元格 className：bg-elevated + muted caption + 大写追踪 */
export const TABLE_TH_CLASS =
  'text-caption text-fg-tertiary uppercase tracking-wide font-semibold py-2.5 px-3';

/** 表头单元格 inline style（保留调用方兼容；新代码用 TABLE_TH_CLASS 即可） */
export const TABLE_TH_STYLE: CSSProperties = {
  color: 'hsl(var(--fg-tertiary))',
  borderBottom: '2px solid hsl(var(--border-subtle))',
};

/** 数据单元格基础 className */
export const TABLE_TD_CLASS = 'text-body text-fg py-2 px-3';

/** 数据单元格 inline style（兼容旧调用方） */
export const TABLE_TD_STYLE: CSSProperties = {
  color: 'hsl(var(--fg))',
  borderBottom: '1px solid hsl(var(--border-subtle))',
};

/** 仅含下边框的单元格 style，调用方 spread 后追加自定义 color 等字段 */
export const TABLE_TD_BORDER: CSSProperties = {
  borderBottom: '1px solid hsl(var(--border-subtle))',
};
