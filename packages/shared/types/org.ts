// 组织与多租户 RBAC 共享类型（ADR-017、ADR-032）

/** 组织内成员角色（ADR-017、ADR-032） */
export type OrgRole = 'owner' | 'admin' | 'analyst' | 'readonly';
