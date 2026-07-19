/**
 * @file Auth 表单字段
 * @description Login/Signup 等认证页面共享的标签 + 输入框单元，统一样式与无障碍属性。
 */
import type { CSSProperties } from 'react';

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
export default function AuthFormField({
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
