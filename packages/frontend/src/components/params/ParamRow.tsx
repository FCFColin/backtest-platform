import type { ReactNode } from 'react';

export interface ParamRowProps {
  children: ReactNode;
  columns?: number;
}

/**
 * 参数行组件 - 使用 CSS Grid 横向排列参数卡片
 * @param children - ParamCard 子元素
 * @param columns - 指定列数，默认 auto-fit
 */
export function ParamRow({ children, columns }: ParamRowProps) {
  const style = columns ? { gridTemplateColumns: `repeat(${columns}, 1fr)` } : undefined;
  return (
    <div className="param-row" style={style}>
      {children}
    </div>
  );
}
