// 组织与多租户 RBAC 共享类型（ADR-007、ADR-009）

/** 组织内成员角色（ADR-007、ADR-009） */
export type OrgRole = 'owner' | 'admin' | 'analyst' | 'readonly';
