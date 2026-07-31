# STRIDE 威胁建模

## 1. 数据流图与信任边界

    公网 -> APISIX(WAF/TLS) -> Express API(JWT/RBAC) -> PostgreSQL(RLS) / Redis / Go 引擎

信任边界: 公网-DMZ(APISIX), DMZ-内网(API), 内网-数据层(PG/Redis)。

## 2. STRIDE 威胁分析

| 类别       | 威胁           | 缓解                                     |
| ---------- | -------------- | ---------------------------------------- |
| S 欺骗     | 伪造身份/Token | JWT RS256 + Refresh 轮换 + MFA           |
| S 欺骗     | API Key 泄露   | 按组织密钥(SHA-256 哈希), 可吊销         |
| T 篡改     | 数据篡改       | RLS + RBAC + 审计日志 HMAC 链式 hash     |
| T 篡改     | SQL 注入       | 参数化查询(pg/pgx), Zod 验证             |
| R 抵赖     | 操作否认       | 审计日志(userId, timestamp, IP, HMAC)    |
| I 信息泄露 | 数据泄露       | RLS 隔离 + TLS 传输 + 最小权限           |
| I 信息泄露 | 错误信息泄露   | RFC 7807 标准错误, 不返回堆栈            |
| D 拒绝服务 | API 滥用       | 限流(apiLimiter/computeLimiter) + 熔断器 |
| D 拒绝服务 | DDoS           | 云厂商 DDoS 防护 + APISIX WAF            |
| E 权限提升 | 越权访问       | RBAC 三角色 + 所有权校验(IDOR 防护)      |
| E 权限提升 | 水平越权       | tenant_id + RLS + 404 防枚举             |

## 3. 优先级

| 优先级 | 威胁           | 现状                        |
| ------ | -------------- | --------------------------- |
| P0     | API Key 泄露   | 已缓解: 按组织密钥 + 可吊销 |
| P0     | SQL 注入       | 已缓解: 参数化查询          |
| P1     | IDOR(水平越权) | 已缓解: 所有权校验 + 404    |
| P1     | 数据泄露       | 已缓解: RLS + TLS           |
| P2     | DDoS           | 生产部署时启用云厂商防护    |

## 4. 架构安全现状

认证(JWT+MFA) + 授权(RBAC+RLS) + 审计(HMAC链式hash) + 加密(TLS+bcrypt) + 限流(分层) + 熔断(fail-closed)。等保三级自评 91/100 分通过。
