import { initSchema } from './migrations.js';

// 超管迁移入口：least-privilege 流程先由超管建表、应用角色仅 DML（ADR-009）。
// 用法：DATABASE_URL=postgresql://backtest:<pw>@<host>:<port>/<db> pnpm --filter @backtest/backend run migrate
await initSchema();
