/**
 * 租户上下文（RLS 强制点，ADR-032）
 *
 * 多租户隔离的安全保证由 Postgres RLS 提供，而非靠每个查询都记得加 `WHERE tenant_id=`。
 *
 * withTenant 实现统一收敛到 db/pool.ts（Task C26 去重），
 * 本模块仅作语义入口 re-export，消除原先与 pool.ts 重复的 45 行实现（jscpd C26）。
 */

export { withTenant } from './pool.js';
