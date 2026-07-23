/**
 * @file Auth 表单组件聚合
 * @description Login/Signup/Invite 等认证页面共享的提交按钮、字段、品牌图标徽章。
 *   合并自 AuthSubmitButton / BrandIconBadge / AuthFormField。
 */
import type { CSSProperties, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

// ============ AuthSubmitButton ============

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
export function AuthSubmitButton({
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

// ============ BrandIconBadge ============

interface BrandIconBadgeProps {
  /** 图标元素（通常为 lucide-react 图标，如 <LogIn className="w-5 h-5" />） */
  icon: ReactNode;
  /** 徽章尺寸：sm = 40×40/radius 10（水平头部），lg = 44×44/radius 12（居中头部） */
  size?: 'sm' | 'lg';
  /** 追加到基础样式上的内联样式（如居中头部需要的 margin: '0 auto 14px'） */
  style?: CSSProperties;
}

const SIZE_DIMENSIONS: Record<
  'sm' | 'lg',
  { width: number; height: number; borderRadius: number }
> = {
  sm: { width: 40, height: 40, borderRadius: 10 },
  lg: { width: 44, height: 44, borderRadius: 12 },
};

/**
 * 品牌色圆角图标容器。统一 Auth 页面头部图标样式：品牌色背景 + 白色图标 + flex 居中。
 *
 * @param icon - 图标元素
 * @param size - 尺寸变种，默认 'sm'
 * @param style - 追加样式（如居中头部的外边距）
 * @returns 渲染后的徽章 div
 */
export function BrandIconBadge({ icon, size = 'sm', style }: BrandIconBadgeProps) {
  const dims = SIZE_DIMENSIONS[size];
  return (
    <div
      style={{
        ...dims,
        background: 'var(--brand)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    >
      {icon}
    </div>
  );
}

// ============ AuthFormField ============

/** AuthFormField 组件 Props */
interface AuthFormFieldProps {
  /** 字段标签文本（已翻译） */
  label: string;
  /** 当前输入值 */
  value: string;
  /** 值变更回调 */
  onChange: (v: string) => void;
  /** 输入类型，默认 'text' */
  type?: 'text' | 'email' | 'password';
  /** autocomplete 属性提示（如 'username' / 'current-password'） */
  autoComplete?: string;
  /** 是否必填，默认 true */
  required?: boolean;
  /** 最小长度（用于密码字段） */
  minLength?: number;
  /** 额外样式（如 placeholder 透传） */
  style?: CSSProperties;
}

const FIELD_LABEL_STYLE: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-body)',
};
const FIELD_WRAP_STYLE: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };

/**
 * 认证表单字段：统一 label + input 样式。
 * @param label - 字段标签文本
 * @param value - 当前值
 * @param onChange - 值变更回调
 * @param type - 输入类型，默认 'text'
 * @param autoComplete - autocomplete 属性
 * @param required - 是否必填，默认 true
 * @param minLength - 最小长度
 * @returns 渲染后的 label + input 元素
 */
export function AuthFormField({
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  required = true,
  minLength,
  style,
}: AuthFormFieldProps) {
  return (
    <label style={FIELD_WRAP_STYLE}>
      <span style={FIELD_LABEL_STYLE}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        className="portfolio-rebalance-select"
        style={{ width: '100%', height: 40, ...style }}
      />
    </label>
  );
}
