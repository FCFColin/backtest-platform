// 组织与多租户 RBAC 共享类型（ADR-017、ADR-032）
//
// 跨端复用：后端 membership/jwt/中间件 与 前端组织管理 UI 共享同一角色字面量联合，
// 避免 backend 内部多份定义漂移（原 membershipRepo.ts 与 authTypes.ts 各自定义），
// 并为前端 Role 派生（Exclude<OrgRole,'owner'>）提供单一来源。

/**
 * 组织内成员角色字面量联合。
 *
 * - `owner`：组织创建者，权限最高且不可被降级为其他角色（业务约束由 services 层强制）
 * - `admin`：组织管理员，可管理成员与邀请
 * - `analyst`：分析师，可读写回测/组合等业务数据
 * - `readonly`：只读成员
 *
 * 用于：JWT.org_role、memberships.role、组织管理 API 请求/响应、前端 RoleSelect。
 */
export type OrgRole = 'owner' | 'admin' | 'analyst' | 'readonly';
