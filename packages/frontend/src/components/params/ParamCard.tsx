import type { ReactNode } from 'react';

export interface ParamCardProps {
  label: string;
  children: ReactNode;
  fullWidth?: boolean;
}

/**
 * 单个参数卡片组件
 * @param label - 参数标签
 * @param children - 输入控件
 * @param fullWidth - 是否占满整行
 */
export function ParamCard({ label, children, fullWidth }: ParamCardProps) {
  return (
    <div className={`param-card ${fullWidth ? 'param-card-full' : ''}`}>
      <label className="param-card-label">{label}</label>
      <div className="param-card-control">{children}</div>
    </div>
  );
}
