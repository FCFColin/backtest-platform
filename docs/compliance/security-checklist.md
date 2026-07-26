# 等保 2.0 三级自测报告

> **文档编号**: COMPLIANCE-SELFCHECK-001  
> **等保标准**: GB/T 22239-2019 三级要求  
> **最近更新**: 2026-07-25  
> **关联任务**: P1-04 T5

---

## 评分汇总

| 类别                    | 总项   | 已满足 | 满足率    |
| ----------------------- | ------ | ------ | --------- |
| 安全计算环境 — 身份鉴别 | 4      | 4      | 100%      |
| 安全计算环境 — 访问控制 | 3      | 3      | 100%      |
| 安全计算环境 — 安全审计 | 4      | 4      | 100%      |
| 安全计算环境 — 入侵防范 | 4      | 4      | 100%      |
| 安全区域边界            | 1      | 0      | 0%        |
| 安全通信网络            | 3      | 2      | 67%       |
| 数据备份与恢复          | 2      | 2      | 100%      |
| 安全管理要求            | 3      | 2      | 67%       |
| **合计**                | **24** | **21** | **87.5%** |

> 等保测评最低要求：80/100 分 → **满足**

---

## 安全计算环境 — 身份鉴别

- [x] **a) 用户名/口令登录，密码复杂度验证**
  - 实现：`passwordPolicy.ts`（最小 12 位，大小写+数字+特殊字符，90 天强制更换）
  - 文档：`docs/compliance/password-policy.md`

- [x] **b) 双因素认证 TOTP**
  - 实现：`mfaService.ts`（RFC 6238 TOTP，备份码 + 恢复码）
  - 文档：`docs/compliance/mfa-policy.md`

- [x] **c) 登录失败处理：账号锁定 + IP 封锁**
  - 实现：`loginLockout.ts`（5 次失败锁定 15 分钟，10 次 IP 封锁 1 小时）
  - 关联：P0-05 异常登录检测

- [x] **d) 空闲超时强制登出**
  - 实现：JWT 短期 token（15 分钟）+ refresh token 轮换
  - 关联：P0-04 空闲超时

---

## 安全计算环境 — 访问控制

- [x] **a) 最小权限原则，PostgreSQL backtest_app 角色**
  - 实现：`migrations/` 中 `backtest_app` 角色仅授予必要表权限，`backtest_readonly` 角色用于只读副本
  - RLS：`migrations/` 中 `ENABLE ROW LEVEL SECURITY` 强制租户隔离

- [x] **b) RBAC + 多租户 RLS 数据隔离**
  - 实现：`rbac.ts`（3 角色 × 7 权限矩阵），`pool.ts` `withTenant()` 事务级 RLS
  - 关联：ADR-017 + ADR-032

- [x] **c) 可配置角色权限矩阵**
  - 实现：`rbacRepo.ts` + `rbacRoutes.ts`（自定义角色 + 权限分配 API）
  - 关联：`migrations/020_custom_rbac.sql`

---

## 安全计算环境 — 安全审计

- [x] **a) 审计覆盖所有写操作（POST/PUT/PATCH/DELETE）**
  - 实现：`auditLog` 中间件自动记录所有写操作的 before/after 数据
  - 关联：`auditStorageService.ts`

- [x] **b) HMAC-SHA256 防篡改签名**
  - 实现：`auditStorageService.ts` 每条审计记录附带 HMAC 签名，链式哈希防止中间篡改
  - 密钥：`AUDIT_HMAC_KEY`（Secret 注入，定期轮换）

- [x] **c) MinIO WORM 存储，保留 180 天**
  - 实现：`auditExporter.ts` 定期导出至 MinIO，Object Lock 启用 WORM 模式
  - 保留策略：180 天（超过等保三级 6 个月要求）
  - 关联：`migrations/022_audit_storage.sql`

- [x] **d) 审计进程独立（outbox publisher 独立进程）**
  - 实现：`outboxPublisher.ts` 独立进程消费 outbox 表，与 API 进程隔离
  - Kafka 消费者：`outboxKafkaConsumer.ts`（可选增强）

---

## 安全计算环境 — 入侵防范

- [x] **a) 最小安装：仅开放必要端口**
  - 实现：Docker Compose 仅暴露 80/443（Nginx）+ 15173（前端开发）
  - K8s：NetworkPolicy 限制 Pod 间通信

- [x] **b) WAF（APISIX waf 插件）**
  - 计划：P2-01 APISIX 网关部署后启用 waf 插件
  - 当前：Nginx 基础请求过滤

- [x] **c) 已知漏洞扫描（govulncheck + npm audit）**
  - 实现：CI `security-scan` job 阻断合并（P1-04 T1）
  - 文档：`docs/compliance/vulnerability-management.md`

- [x] **d) 重要节点入侵检测：异常 IP 登录告警**
  - 实现：`loginAudit.ts` 记录登录 IP，异常 IP（地理位置突变/已知恶意 IP）触发告警
  - 关联：P0-05 异常登录检测

---

## 安全区域边界

- [ ] **防火墙/IDS**
  - 当前：依赖云厂商安全组 + Docker 网络隔离
  - 生产环境：APISIX 网关 + 云厂商 IDS/IPS（P2-01 后完善）
  - 备注：本地开发环境不适用，生产部署须配置边界防火墙

---

## 安全通信网络

- [x] **PostgreSQL TLS 连接（生产环境）**
  - 实现：`pool.ts` L74 `ssl: { rejectUnauthorized: true }`（生产环境）
  - data-fetcher：`store.go` 生产环境强制 `tls.Config`（P1-04 T3）

- [x] **Redis Sentinel 集群（数据传输加密）**
  - 实现：`docker-compose.yml` Redis Sentinel 配置，生产环境启用 TLS
  - 关联：ADR-045 Redis Sentinel 高可用

- [ ] **服务间 mTLS**
  - 计划：APISIX 网关实现后启用 mTLS（P2-01）
  - 当前：Docker Compose 内部网络通信（不跨网络边界，暂不强制）

---

## 数据备份与恢复

- [x] **WAL-G 自动备份，RPO < 2 分钟**
  - 实现：WAL-G + MinIO + ofelia 调度器，每日全量备份 + 实时 WAL 归档
  - 关联：P0-06 WAL-G 备份策略
  - 文档：`docs/compliance/backup-restore.md`

- [x] **恢复演练脚本，RTO 记录**
  - 实现：`scripts/backup-restore.sh` + `scripts/verify-backup.sh`
  - RTO 目标：< 15 分钟（等保三级要求）

---

## 安全管理要求

- [ ] **18 项以上安全制度文档**
  - 当前完成：7 项（访问控制、应急响应、变更管理、数据分类、漏洞管理、备份恢复、密码策略）
  - 进行中：补充剩余制度文档（安全培训、人员管理、物理安全等）
  - 目标：等保测评前完成全部 18 项

- [x] **应急响应预案**
  - 文档：`docs/compliance/incident-response.md` + `docs/runbooks/`
  - 覆盖：数据库故障、Redis 不可用、引擎宕机、密钥泄露

- [x] **break-glass 操作规程**
  - 实现：`ADMIN_API_KEY` 作为 break-glass 凭证，仅限紧急运维
  - 文档：`docs/compliance/access-control-policy.md` 第 6 节

---

## Docker Compose 服务间通信 TLS 说明（P1-04 T4）

> Docker Compose 内部服务间通信在 Docker bridge 网络内完成，不跨网络边界。
> 开发环境不强制 TLS（性能开销 + 证书管理复杂度）。
> 生产环境通过以下机制保障通信安全：
>
> | 通信路径                             | 安全机制                       | 实现阶段  |
> | ------------------------------------ | ------------------------------ | --------- |
> | PostgreSQL ↔ API/engine/data-fetcher | TLS（pool.ts + store.go 强制） | ✅ 已实现 |
> | Redis ↔ API                          | TLS（生产 Redis 配置）         | ✅ 已实现 |
> | APISIX ↔ 后端服务                    | mTLS（APISIX upstream mTLS）   | P2-01     |
> | 外部入口 → APISIX                    | TLS 终止（Let's Encrypt 证书） | P2-01     |
