/**
 * @file 角色选择下拉框
 * @description 在 MemberTable 行内与 InviteDialog 表单中复用的角色下拉框，
 *              选项来自 orgTypes.ROLES（owner 由组织创建者独占，不在此处可选）。
 *              选项文案为角色字面量（admin/analyst/readonly），与原实现保持一致。
 */
import type { CSSProperties } from 'react';
import { ROLES, type Role } from './orgTypes.js';

interface RoleSelectProps {
  /** 当前选中的角色值 */
  value: string;
  /** 是否禁用（写入进行中时为 true） */
  disabled?: boolean;
  /** 选中变更回调，参数为新角色字面量 */
  onChange: (role: Role) => void;
  /** 透传给原生 select 的 className */
  className?: string;
  /** 透传给原生 select 的 style */
  style?: CSSProperties;
}

/** 角色选择下拉框（admin / analyst / readonly） */
export function RoleSelect({ value, disabled, onChange, className, style }: RoleSelectProps) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as Role)}
      className={className}
      style={style}
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {r}
        </option>
      ))}
    </select>
  );
}
