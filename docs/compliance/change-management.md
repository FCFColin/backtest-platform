# 变更管理规范（等保三级 8.1.5.3 变更管理）

> **文档编号**: COMPLIANCE-CM-001  
> **等保条款**: GB/T 22239-2019 三级 — 8.1.5.3 变更管理  
> **最近更新**: 2026-07-25  
> **关联任务**: P1-04 T6

---

## 1. 变更分类

### 1.1 变更级别

| 级别         | 定义                                             | 审批流程                       | 部署窗口                         |
| ------------ | ------------------------------------------------ | ------------------------------ | -------------------------------- |
| **重大变更** | 数据库 schema 变更 / 核心架构调整 / 安全配置修改 | 技术负责人 + CTO 审批          | 维护窗口（周末 02:00-06:00 CST） |
| **常规变更** | 功能开发 / 依赖升级 / 配置调整                   | PR review + CI 通过            | 工作日 10:00-18:00 CST           |
| **紧急变更** | 生产 hotfix / 安全漏洞修复                       | 技术负责人口头审批，事后补记录 | 随时                             |

### 1.2 变更类型

| 类型           | 审查重点                                            | 回滚方案                                           |
| -------------- | --------------------------------------------------- | -------------------------------------------------- |
| **数据库迁移** | migration up/down 测试（CI migration-rollback job） | `rollbackSchema(N)` 回滚到指定版本                 |
| **依赖升级**   | 漏洞扫描 + 兼容性测试                               | 回退到上一个 lockfile 版本                         |
| **配置变更**   | 影响范围评估 + 灰度验证                             | 恢复上一个配置版本                                 |
| **基础设施**   | K8s/Docker Compose 配置审查                         | `kubectl rollout undo` / `docker compose rollback` |

---

## 2. 变更流程

### 2.1 标准流程（常规变更）

```
1. 创建分支（feature/* / fix/* / refactor/*）
2. 开发 + 本地测试（npm run dev / npm run test:unit）
3. 提交 PR → CI 自动检查（type-check / lint / test / security-scan）
4. Code Review（至少 1 人 approve）
5. 合并到 main → CI 自动部署（staging）
6. 手动验证 staging → 标记发布
```

### 2.2 数据库迁移流程

```
1. 创建 migration 文件（migrations/NNN_description.sql + NNN_description_down.sql）
2. 本地验证：initSchema → rollbackSchema(0) → initSchema 循环
3. CI migration-rollback job 验证 up→down→up 循环
4. 生产部署：先执行 down 验证（dry-run），再执行 up
5. 确认应用兼容性（新代码 + 旧 schema → 新代码 + 新 schema）
```

### 2.3 紧急变更流程

```
1. 技术负责人口头/即时通讯授权
2. 直接在 main 创建 hotfix commit
3. 部署到生产
4. 24 小时内补充 PR + 事后审查报告
5. 安全相关紧急变更须通知安全负责人
```

---

## 3. 回滚策略

### 3.1 应用回滚

| 部署方式       | 回滚命令                                        | 回滚时间 |
| -------------- | ----------------------------------------------- | -------- |
| Docker Compose | `docker compose up -d --no-deps api:<prev-tag>` | < 1 分钟 |
| K8s            | `kubectl rollout undo deployment/api`           | < 2 分钟 |
| 数据库         | `rollbackSchema(N)`                             | < 5 分钟 |

### 3.2 回滚测试

- **CI 强制**: `migration-rollback` job 验证每次迁移可回滚
- **生产要求**: 每次重大变更前确认回滚方案可行

---

## 4. 版本管理

### 4.1 Git 分支策略

| 分支        | 用途         | 保护规则                  |
| ----------- | ------------ | ------------------------- |
| `main`      | 生产发布分支 | 禁止直接 push，仅 PR 合并 |
| `feature/*` | 功能开发     | 合并后删除                |
| `fix/*`     | 缺陷修复     | 合并后删除                |
| `hotfix/*`  | 紧急修复     | 从 main 创建，合并后删除  |

### 4.2 提交规范

Conventional Commits 格式：

```
<type>(<scope>): <description>

types: feat / fix / refactor / chore / docs / test
scope: backend / frontend / engine / data / db / infra / ci
```

### 4.3 镜像版本

- Docker 镜像 tag = git commit SHA（可追溯）
- 禁止使用 `latest` tag
- GHCR 保留最近 10 个版本

---

## 5. 等保三级对照

| 等保条款   | 要求           | 实现方式                             | 状态 |
| ---------- | -------------- | ------------------------------------ | ---- |
| 8.1.5.3 a) | 变更申请与审批 | 分级审批流程（重大/常规/紧急）       | ✅   |
| 8.1.5.3 b) | 变更前测试     | CI 自动测试 + staging 验证           | ✅   |
| 8.1.5.3 c) | 变更记录       | Git 历史 + PR 记录 + 审计日志        | ✅   |
| 8.1.5.3 d) | 回滚方案       | CI migration-rollback + 镜像版本回退 | ✅   |
