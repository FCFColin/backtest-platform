import type { ReactNode, CSSProperties } from 'react';

export interface ParamRowProps {
  children: ReactNode;
  columns?: number;
  style?: CSSProperties;
  className?: string;
}

/**
 * 参数行组件 - 使用 CSS Grid 横向排列参数卡片
 * @param children - ParamCard 子元素
 * @param columns - 指定列数，默认 auto-fit
 * @param style - 自定义样式
 * @param className - 自定义类名
 */
export function ParamRow({ children, columns, style, className }: ParamRowProps) {
  const gridStyle = columns ? { gridTemplateColumns: `repeat(${columns}, 1fr)` } : undefined;
  const mergedStyle = { ...gridStyle, ...style };
  return (
    <div className={`param-row ${className || ''}`} style={mergedStyle}>
      {children}
    </div>
  );
}
