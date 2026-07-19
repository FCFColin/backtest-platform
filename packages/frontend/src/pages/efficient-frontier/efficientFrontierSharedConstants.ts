/**
 * @file 有效前沿结果共享常量与纯函数
 * @description 从 EfficientFrontierShared.tsx 拆出的非组件导出，避免触发 react-refresh/only-export-components 规则
 */
import type { CSSProperties } from 'react';

/** sharpe 颜色映射：低 → 红，高 → 绿 */
export function sharpeToColor(sharpe: number, minSharpe: number, maxSharpe: number): string {
  if (maxSharpe === minSharpe) return '#2e8b57';
  const t = Math.max(0, Math.min(1, (sharpe - minSharpe) / (maxSharpe - minSharpe)));
  const r = t < 0.5 ? 220 : Math.round(220 - (t - 0.5) * 2 * 220);
  const g = t < 0.5 ? Math.round(t * 2 * 180) : 180;
  const b = t < 0.5 ? 50 : Math.round(50 + (t - 0.5) * 2 * 37);
  return `rgb(${r},${g},${b})`;
}

/** 区块标题统一样式 */
export const SECTION_TITLE_STYLE: CSSProperties = {
  fontWeight: 600,
  fontSize: 14,
  color: 'var(--text-strong)',
  marginBottom: 12,
  marginTop: 24,
};
