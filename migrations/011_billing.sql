-- 011 Stripe 计费：客户与订阅映射（ADR-036）
--
-- 企业理由：SaaS 变现依赖把"组织（租户）"映射到 Stripe 的 customer 与 subscription，
-- 并把订阅状态/计划回写到 organizations，使应用层按计划做配额与功能门控。
--
-- 隔离边界：这两张表属计费控制平面（与 organizations 同类），不启用 RLS——
-- webhook 回调时尚无租户上下文，需按 stripe_customer_id 反查组织。

-- ---------------------------------------------------------------------------
-- 1. 组织 -> Stripe 客户映射（一对一）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stripe_customers (
  org_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 2. 订阅（每组织当前一条活跃订阅；历史以 stripe_subscription_id 唯一）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  plan VARCHAR(20) NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  status VARCHAR(32) NOT NULL DEFAULT 'incomplete',
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON subscriptions(org_id);

-- 授予运行角色对新表的 DML 权限
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backtest_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      stripe_customers, subscriptions
      TO backtest_app;
  END IF;
END
$$;
