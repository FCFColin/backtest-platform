export interface ActionBarProps {
  primary: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    loading?: boolean;
  };
  secondary?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
}

/**
 * 底部操作栏组件
 * @param primary - 主按钮配置
 * @param secondary - 次按钮配置
 */
export function ActionBar({ primary, secondary }: ActionBarProps) {
  return (
    <div className="action-bar">
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
    </div>
  );
}
