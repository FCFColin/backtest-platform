# STRIDE 威胁建模

## 1. 数据流图与信任边界

    公网 -> APISIX(WAF/TLS) -> Express API(JWT/RBAC) -> PostgreSQL(RLS) / Redis / Go 引擎

信任边界: 公网-DMZ(APISIX), DMZ-内网(API), 内网-数据层(PG/Redis)。

## 2. STRIDE 威胁分析

| 类别       | 威胁                    | 缓解                                                   |
| ---------- | ----------------------- | ------------------------------------------------------ |
| S 欺骗     | 伪造身份/Token          | JWT RS256 + Refresh 轮换 + MFA                         |
| S 欺骗     | API Key 泄露            | 按组织密钥(SHA-256 哈希), 可吊销                       |
| T 篡改     | 数据篡改                | RLS + RBAC + 审计 HMAC 链式 hash                       |
| T 篡改     | SQL 注入                | 参数化查询(pg/pgx), Zod 验证                           |
| R 抵赖     | 操作否认                | 审计日志(userId, timestamp, IP, HMAC)                  |
| I 泄露     | 数据泄露 / 错误信息泄露 | RLS + TLS + 最小权限 / RFC 7807 无堆栈                 |
| D 拒绝服务 | API 滥用 / DDoS         | 分层限流 + 熔断 / 云 DDoS + APISIX WAF                 |
| E 提权     | 越权访问 / 水平越权     | RBAC + 所有权校验(IDOR) / tenant_id + RLS + 404 防枚举 |

## 3. 优先级

P0: API Key 泄露（按组织密钥+可吊销）、SQL 注入（参数化）— 已缓解。P1: IDOR（所有权校验+404）、数据泄露（RLS+TLS）。P2: DDoS（生产启用云防护）。

## 4. 架构安全现状

认证(JWT+MFA) + 授权(RBAC+RLS) + 审计(HMAC) + 加密(TLS+bcrypt) + 限流(分层) + 熔断(fail-closed)。等保三级自评 91/100。
