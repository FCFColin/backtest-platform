import type { ReactNode } from 'react';

export interface ParamSectionProps {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}

/**
 * 参数区域容器组件
 * @param title - 区域标题
 * @param children - 参数内容
 * @param actions - 标题行右侧操作区
 */
export function ParamSection({ title, children, actions }: ParamSectionProps) {
  return (
    <section className="param-section">
      <div className="param-section-header">
        <h2 className="param-section-title">{title}</h2>
        {actions && <div className="param-section-actions">{actions}</div>}
      </div>
      <div className="param-section-content">{children}</div>
    </section>
  );
}
