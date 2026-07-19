/**
 * @file 蒙特卡洛结果共享常量
 * @description 从 MonteCarloShared.tsx 拆出的非组件导出，避免触发 react-refresh/only-export-components 规则
 */
import type { CSSProperties } from 'react';
import type { ResultTab } from './monteCarloTypes.js';

/** 空数据提示样式 */
export const EMPTY_DATA_STYLE: CSSProperties = {
  color: 'var(--text-muted)',
  textAlign: 'center',
  padding: 24,
};

/** Tab 定义（key + 英文 label，label 直接展示不经 i18n） */
export const RESULT_TABS: { key: ResultTab; label: string }[] = [
  { key: 'summary', label: 'Summary' },
  { key: 'range', label: 'Portfolio Value Range' },
  { key: 'success', label: 'Portfolio Success' },
  { key: 'distributions', label: 'Distributions' },
  { key: 'scenarios', label: 'Scenarios' },
];
