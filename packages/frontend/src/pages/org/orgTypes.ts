/**
 * @file 组织成员管理共享类型与样式常量
 * @description 聚合 OrgMembersPage 及其子组件之间共享的类型与表格样式常量，
 *              避免重复定义并防止循环依赖。所有写操作仍由 useOrgMembersState
 *              统一封装，UI 仅消费此处的只读类型。
 */
import type { CSSProperties } from 'react';

/** 组织成员 */
export interface Member {
  userId: string;
  username: string;
  email: string | null;
  role: string;
  createdAt: string;
}

/** 邮箱邀请记录 */
export interface Invitation {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  acceptedAt: string | null;
}

/** 可分配的成员角色（owner 由组织创建者独占，不在此枚举中） */
export const ROLES = ['admin', 'analyst', 'readonly'] as const;

/** 角色字面量联合类型，用于强类型化 RoleSelect / 邀请表单的选中值 */
export type Role = (typeof ROLES)[number];

/** 表头单元格样式，由 MemberTable / InvitationTable 共享 */
export const TABLE_TH: CSSProperties = {
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-muted)',
  padding: '8px 10px',
};

/** 表体单元格样式，由 MemberTable / InvitationTable 共享 */
export const TABLE_TD: CSSProperties = {
  fontSize: 13,
  color: 'var(--text-body)',
  padding: '8px 10px',
  borderTop: '1px solid var(--border, #e5e7eb)',
};
