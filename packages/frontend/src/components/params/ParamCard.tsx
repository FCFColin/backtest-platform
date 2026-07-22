import type { ReactNode, CSSProperties } from 'react';

export interface ParamCardProps {
  label: string;
  children: ReactNode;
  fullWidth?: boolean;
  style?: CSSProperties;
  className?: string;
}

/**
 * 单个参数卡片组件
 * @param label - 参数标签
 * @param children - 输入控件
 * @param fullWidth - 是否占满整行
 * @param style - 自定义样式
 * @param className - 自定义类名
 */
export function ParamCard({ label, children, fullWidth, style, className }: ParamCardProps) {
  return (
    <div
      className={`param-card ${fullWidth ? 'param-card-full' : ''} ${className || ''}`}
      style={style}
    >
      <label className="param-card-label">{label}</label>
      <div className="param-card-control">{children}</div>
    </div>
  );
}
