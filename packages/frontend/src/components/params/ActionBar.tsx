import type { ReactNode } from 'react';

export interface ActionBarProps {
  /** 主按钮配置（与 children 二选一） */
  primary?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    loading?: boolean;
  };
  /** 次按钮配置 */
  secondary?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
  /** 自定义内容（与 primary 二选一） */
  children?: ReactNode;
}

/**
 * 底部操作栏组件
 * @param primary - 主按钮配置
 * @param secondary - 次按钮配置
 * @param children - 自定义按钮内容
 */
export function ActionBar({ primary, secondary, children }: ActionBarProps) {
  return (
    <div className="action-bar">
      {children ? (
        children
      ) : primary ? (
        <>
          <button
            type="button"
            className="btn-primary"
            onClick={primary.onClick}
            disabled={primary.disabled || primary.loading}
          >
            {primary.loading ? '...' : primary.label}
          </button>
          {secondary && (
            <button
              type="button"
              className="btn-secondary"
              onClick={secondary.onClick}
              disabled={secondary.disabled}
            >
              {secondary.label}
            </button>
          )}
        </>
      ) : null}
    </div>
  );
}
