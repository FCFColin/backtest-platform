/**
 * @file LoadingButton 通用按钮组件
 * @description 支持加载状态的通用按钮，loading 时显示旋转图标与 loadingText，自动禁用
 * @example
 * <LoadingButton isLoading={isLoading} onClick={handleRun} loadingText="计算中...">
 *   <Play className="w-4 h-4" />
 *   计算有效前沿
 * </LoadingButton>
 */
import type { ReactNode, MouseEventHandler } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';

interface LoadingButtonProps {
  /** 是否处于加载状态 */
  isLoading: boolean;
  /** 点击事件处理函数 */
  onClick: MouseEventHandler<HTMLButtonElement>;
  /** 非加载状态下显示的内容（可包含图标与文字） */
  children: ReactNode;
  /** 加载状态下显示的文字，默认为 "加载中..." */
  loadingText?: string;
  /** 是否禁用按钮（除 loading 外的额外禁用条件） */
  disabled?: boolean;
  /** 附加的 className，默认 "main-action-btn" 以兼容现有样式 */
  className?: string;
  /** 行内样式 */
  style?: React.CSSProperties;
  /** 按钮 type，默认 "button" */
  type?: 'button' | 'submit' | 'reset';
}

/**
 * 通用加载状态按钮
 *
 * - loading 时显示旋转的 Loader2 图标与 loadingText，并禁用点击
 * - 非 loading 时显示 children
 * - 默认使用 main-action-btn 样式类，与项目现有按钮保持一致
 */
export default function LoadingButton({
  isLoading,
  onClick,
  children,
  loadingText,
  disabled = false,
  className = 'main-action-btn',
  style,
  type = 'button',
}: LoadingButtonProps) {
  const { t } = useTranslation();
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isLoading || disabled}
      className={className}
      style={style}
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          {loadingText ?? t('common.loading')}
        </>
      ) : (
        children
      )}
    </button>
  );
}
