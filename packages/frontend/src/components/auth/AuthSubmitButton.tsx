/**
 * @file Auth 提交按钮
 * @description Login/Signup 等认证表单共享的提交按钮：loading 态切换图标与文案。
 */
import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

/** AuthSubmitButton 组件 Props */
interface AuthSubmitButtonProps {
  /** 是否加载中 */
  loading: boolean;
  /** 空闲态图标 */
  icon: ReactNode;
  /** 空闲态文案 */
  label: string;
  /** 加载态文案 */
  loadingLabel: string;
}

const BUTTON_STYLE = {
  height: 42,
  marginTop: 4,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
} as const;

/**
 * 认证表单提交按钮：统一 main-action-btn 样式与 loading 切换。
 * @param loading - 是否加载中
 * @param icon - 空闲态图标
 * @param label - 空闲态文案
 * @param loadingLabel - 加载态文案
 * @returns 渲染后的 button 元素
 */
export default function AuthSubmitButton({
  loading,
  icon,
  label,
  loadingLabel,
}: AuthSubmitButtonProps) {
  return (
    <button type="submit" disabled={loading} className="main-action-btn" style={BUTTON_STYLE}>
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {loading ? loadingLabel : label}
    </button>
  );
}
