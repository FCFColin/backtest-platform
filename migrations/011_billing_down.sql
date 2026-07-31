-- 011 回滚：移除 Stripe 计费表（ADR-036）
-- ⚠️ 数据丢失警告：DROP TABLE 会永久删除订阅与 Stripe 客户映射数据，不可恢复。
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS stripe_customers;
