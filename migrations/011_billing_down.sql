-- 011 回滚：移除 Stripe 计费表（ADR-036）
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS stripe_customers;
