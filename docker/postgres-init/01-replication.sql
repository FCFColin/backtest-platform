-- P1-03 读写分离：在主库创建流复制角色。
-- 副本使用此角色连接主库并流式同步 WAL（hot_standby）。
-- 生产环境密码须通过 Secret 注入，此处仅本地开发默认值。
CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'replica_pass';
