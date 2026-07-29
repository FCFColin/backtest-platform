-- =============================================================================
-- 迁移 v20：可配置 RBAC（P2-01）— 自定义角色 + 角色权限映射 + 用户角色绑定
-- 描述：将硬编码的 ROLE_PERMISSIONS 映射迁移到数据库，支持租户自定义角色与权限
-- =============================================================================
-- 企业理由（P2-01）：
--   此前 RBAC 权限映射硬编码于 rbac.ts 的 ROLE_PERMISSIONS 常量，新增角色或调整
--   权限需修改代码并重新部署。多租户 SaaS 场景下，不同租户对角色边界有差异化需求
--   （如"仅可回测不可管理数据"的受限分析师），硬编码无法满足。
--   将角色与权限下沉到数据库后，管理员可通过 Admin API 动态创建自定义角色、
--   分配权限、绑定用户，无需发版。
--
-- 权衡：
--   - 隔离边界：roles/role_permissions/user_roles 属于身份/控制平面，与 memberships
--     同类——在"尚未解析出租户"时即被查询（中间件解析用户权限），且需读取系统角色
--     （org_id IS NULL）。因此不启用 RLS，由应用层显式 WHERE org_id 过滤 + 系统角色
--     全局可见，与 009_tenancy.sql 对 memberships 的处理一致。
--   - 向后兼容：保留 users.role 列（legacy 全局角色），user_roles 为增量叠加。
--     中间件优先查 DB 角色，无 DB 角色时回退到 legacy ROLE_PERMISSIONS 映射。
--   - 系统角色（admin/analyst/readonly）is_system=TRUE，禁止修改/删除，保证基线不变。
-- =============================================================================

-- 1) 角色表：系统角色 org_id=NULL，自定义角色绑定租户
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- org_id 为 NULL 表示系统角色（全局可见），非 NULL 为租户自定义角色
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 系统角色 org_id=NULL，自定义角色按 (org_id, name) 唯一
  -- UNIQUE(org_id, name) 允许多个 NULL（Postgres 默认行为），系统角色互不冲突
  CONSTRAINT uq_roles_org_name UNIQUE (org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_roles_org ON roles(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roles_system ON roles(is_system) WHERE is_system = TRUE;

-- 2) 角色权限映射表：角色 → 权限字符串（如 'backtest:run'）
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission VARCHAR(60) NOT NULL,
  PRIMARY KEY (role_id, permission)
);

-- 3) 用户角色绑定表：替代 users.role 单列（保留该列向后兼容）
CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_org ON user_roles(org_id) WHERE org_id IS NOT NULL;

-- 4) portfolios 增加角色可见性数组（用于组合共享给特定角色）
ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS visible_to_roles UUID[];

-- DDL/DML 同迁移说明 (M-009)：以下 INSERT 为系统角色种子数据（is_system=TRUE），
-- 与上方 CREATE TABLE 必须在同一迁移中执行。原因：应用启动时中间件依赖这三个
-- 系统角色（admin/analyst/readonly）存在，若拆分到独立 seed 迁移，在 DDL 迁移
-- 与 seed 迁移之间重启应用会导致 RBAC 查询返回空角色集，全部请求被拒绝。
-- ON CONFLICT DO NOTHING 保证幂等。系统角色 org_id=NULL，不属任何租户。
-- 5) 种子系统角色 + 权限（与 rbac.ts ROLE_PERMISSIONS 对齐）
--    使用 CTE 一次性插入角色并回填权限，避免多次往返
WITH admin_role AS (
  INSERT INTO roles (org_id, name, description, is_system)
  VALUES (NULL, 'admin', '系统管理员，拥有全部权限', TRUE)
  ON CONFLICT DO NOTHING
  RETURNING id
),
analyst_role AS (
  INSERT INTO roles (org_id, name, description, is_system)
  VALUES (NULL, 'analyst', '分析师，可运行回测和管理数据', TRUE)
  ON CONFLICT DO NOTHING
  RETURNING id
),
readonly_role AS (
  INSERT INTO roles (org_id, name, description, is_system)
  VALUES (NULL, 'readonly', '只读用户，仅能查看数据', TRUE)
  ON CONFLICT DO NOTHING
  RETURNING id
),
admin_perms AS (
  SELECT id AS role_id, perm FROM admin_role
  CROSS JOIN unnest(ARRAY[
    'backtest:run','data:manage','data:read','admin:access',
    'optimizer:run','signal:read','strategy:manage'
  ]) AS perm
),
analyst_perms AS (
  SELECT id AS role_id, perm FROM analyst_role
  CROSS JOIN unnest(ARRAY[
    'backtest:run','data:read','data:manage',
    'optimizer:run','signal:read','strategy:manage'
  ]) AS perm
),
readonly_perms AS (
  SELECT id AS role_id, perm FROM readonly_role
  CROSS JOIN unnest(ARRAY['data:read','signal:read']) AS perm
),
all_perms AS (
  SELECT role_id, perm FROM admin_perms
  UNION ALL
  SELECT role_id, perm FROM analyst_perms
  UNION ALL
  SELECT role_id, perm FROM readonly_perms
)
INSERT INTO role_permissions (role_id, permission)
SELECT role_id, perm FROM all_perms
ON CONFLICT DO NOTHING;

-- 授予运行角色对新表的 DML 权限（与 009_tenancy.sql 模式一致）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backtest_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON roles, role_permissions, user_roles TO backtest_app;
  END IF;
END
$$;
