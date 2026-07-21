import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export interface ParamGroupProps {
  title: string;
  children: ReactNode;
  defaultExpanded?: boolean;
  badge?: number;
}

/**
 * 可折叠参数分组组件
 * @param title - 分组标题
 * @param children - 分组内容
 * @param defaultExpanded - 默认是否展开
 * @param badge - 徽章数字
 */
export function ParamGroup({ title, children, defaultExpanded = true, badge }: ParamGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div className="param-group">
      <button
        type="button"
        className="param-group-header"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <ChevronDown className={`param-group-chevron ${expanded ? 'expanded' : ''}`} />
        <span className="param-group-title">{title}</span>
        {badge !== undefined && badge > 0 && <span className="param-group-badge">{badge}</span>}
      </button>
      {expanded && <div className="param-group-body">{children}</div>}
    </div>
  );
}
