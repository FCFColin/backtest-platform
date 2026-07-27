好，明确了。**Chrome DevTools MCP + 多并行子智能体 + 无通信 + 无中断 + 只能输出文本**。

这个组合的最优解是：

- **每个子任务必须是独立的、原子的**（因为不能通信、不能中断）
- **完成状态用可截图验证的具体描述**（因为智能体能截图自查）
- **视觉判断的"最终审判权"仍然给你**（智能体截图给你看，但先自查过一轮）
- **审计 + 修复 + 强化在同一个 plan 里**（一次交付）

下面是完整的 `plan.md`。

---

# plan.md v3.0 — 审计 · 修复 · 强化（一次交付）

## 元信息

- **版本**：v3.0（基于当前生产状态 + 已知 bug 深度审计版）
- **执行环境**：多并行子智能体 IDE + Chrome DevTools MCP（截图/JS/Network）
- **周期**：P0 约 3-5 天 · P1 约 1 周 · P2 约 1-2 周 · P3 约 2 周
- **交付原则**：
  1. 每个任务的"完成状态"必须是**可截图 + 可 DOM 查询验证**的具体描述
  2. 每个子任务必须**原子独立**（因为并行智能体之间不能通信）
  3. 子智能体必须**先自查后交付**（用 Chrome DevTools 自己验证）
  4. 视觉最终审判由你（人）通过截图确认
  5. **不允许"新建 XxxV2 但保留 Xxx"** — 每个组件替换必须删除旧组件并验证无 import 残留

## 全局约束（所有子智能体必读）

### 约束 A：完成状态必须可验证

**禁止**这样写完成条件："PortfolioCard 组件重构完成"

**必须**这样写：

> 完成条件：打开 `http://localhost:15173/`，等待 3 秒，执行以下 DOM 查询，全部返回 true：
>
> - `document.querySelectorAll('[data-testid="portfolio-card"]').length === 1`
> - `document.querySelector('[data-testid="portfolio-card"]').getBoundingClientRect().width >= 320 && <= 460`
> - `document.querySelectorAll('[data-testid="page-title"]').length === 1`（H1 只有一个）
> - 截图 `docs/audit/{task-id}-after.png`，人工确认卡片视觉正常

### 约束 B：每个任务必须包含"自检脚本"

每个任务在完成后，必须运行一段 JS 断言脚本（用 `mcp__chrome-devtools__evaluate_script`），将结果写入 `docs/audit/{task-id}-verify.json`。

### 约束 C：禁止创建 V2 后不删 V1

新增组件必须替换旧组件。如果 `PortfolioCardV2.tsx` 创建了，`PortfolioCard.tsx` 必须删除，且 `grep -rn "PortfolioCard" packages/frontend/src` 只应命中新组件。

### 约束 D：i18n key 添加必须双语同步

添加任何新的 `t('foo.bar')` 后，必须同时在 `zh/translation.json` 和 `en/translation.json` 添加对应条目。任务完成前必须运行：

```bash
node scripts/verify-i18n.mjs
# 该脚本 diff 两个 JSON 文件，输出缺失的 key，缺失 = 失败
```

若脚本不存在，第一个执行的子智能体必须先创建它（见 P0-0-2）。

### 约束 E：数据契约必须两端一致

任何涉及 API 返回值的字段修改，必须同步：

1. Go struct 定义
2. `packages/shared/types/*.ts`
3. 前端渲染逻辑
4. 单元测试的期望值

### 约束 F：截图必须成对

修改任何 UI 前，先截图存 `docs/audit/{task-id}-before-{page}.png`；修改后再截图 `docs/audit/{task-id}-after-{page}.png`。

---

# 阶段 P0：审计与止血（3-5 天）

**目标**：**先诊断，再修复致命 bug**。不做任何新功能。让平台回到"能用、不出洋相"的状态。

**并行度**：审计阶段 5 个子智能体并行，止血阶段 3-4 个并行

---

## P0-0：基础设施准备（1 个子智能体，串行前置，1 天）

在所有并行任务之前，先建立**可验证的基础设施**。

### P0-0-1：创建审计目录与命名规范

创建以下目录结构：

```
docs/audit/
  screenshots/     # 所有截图，命名 {task-id}-{before|after}-{page-slug}.png
  reports/         # 所有子智能体的 JSON 输出，命名 {task-id}-report.json
  network/         # Network 请求录制，命名 {task-id}-{endpoint}.json
INDEX.md           # 索引文件，列出所有 task-id 及状态
```

### P0-0-2：创建 i18n 双语同步验证脚本

**文件**：`scripts/verify-i18n.mjs`

```javascript
#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const zhPath = join(ROOT, 'packages/frontend/src/i18n/locales/zh/translation.json');
const enPath = join(ROOT, 'packages/frontend/src/i18n/locales/en/translation.json');

const zh = JSON.parse(readFileSync(zhPath, 'utf-8'));
const en = JSON.parse(readFileSync(enPath, 'utf-8'));

function flatten(obj, prefix = '') {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      Object.assign(result, flatten(v, key));
    } else {
      result[key] = v;
    }
  }
  return result;
}

const zhFlat = flatten(zh);
const enFlat = flatten(en);
const zhKeys = new Set(Object.keys(zhFlat));
const enKeys = new Set(Object.keys(enFlat));

const missingInEn = [...zhKeys].filter((k) => !enKeys.has(k));
const missingInZh = [...enKeys].filter((k) => !zhKeys.has(k));

// 检测前端源代码中所有 t('xxx') 调用的 key
import { execSync } from 'node:child_process';
const grepOut = execSync(
  `grep -rEho "t\\(['\\"]([a-zA-Z0-9._-]+)['\\"]" packages/frontend/src --include='*.tsx' --include='*.ts' || true`,
  { encoding: 'utf-8' },
);
const usedKeys = new Set([...grepOut.matchAll(/t\(['"]([a-zA-Z0-9._-]+)['"]/g)].map((m) => m[1]));
const unusedZh = [...zhKeys].filter((k) => !usedKeys.has(k) && !k.startsWith('_'));
const undefinedInSource = [...usedKeys].filter((k) => !zhKeys.has(k));

const report = {
  timestamp: new Date().toISOString(),
  zhKeyCount: zhKeys.size,
  enKeyCount: enKeys.size,
  usedKeyCount: usedKeys.size,
  missingInEn,
  missingInZh,
  undefinedInSource,
  unusedZh: unusedZh.slice(0, 20), // 只列前 20 个避免噪音
  status:
    missingInEn.length + missingInZh.length + undefinedInSource.length === 0 ? 'PASS' : 'FAIL',
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.status === 'PASS' ? 0 : 1);
```

**完成条件**：

- 运行 `node scripts/verify-i18n.mjs` 输出 JSON，且能识别当前的 `common.equalize`、`common.normalize`、`portfolio.deepAnalysis` 三个 undefined key

### P0-0-3：创建后端数据契约验证脚本

**文件**：`scripts/verify-backtest-contract.mjs`

```javascript
#!/usr/bin/env node
// 调用 /api/v1/backtest/portfolio，用 VTI 60% + BND 40% 从 2010-01-01 到 2024-12-31 的经典组合
// 验证返回值在合理范围

const API = process.env.API_URL ?? 'http://localhost:15001';

const body = {
  portfolios: [
    {
      id: 'test-60-40',
      name: '60/40',
      assets: [
        { ticker: 'VTI', weight: 60 },
        { ticker: 'BND', weight: 40 },
      ],
      rebalanceFrequency: 'quarterly',
      totalReturn: true,
    },
  ],
  startDate: '2010-01-01',
  endDate: '2024-12-31',
  startingValue: 10000,
  currency: 'USD',
};

const res = await fetch(`${API}/api/v1/backtest/portfolio`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const data = await res.json();

const stats = data?.data?.portfolios?.[0]?.stats;
const assertions = {
  hasStats: !!stats,
  cagrInRange: stats?.cagr >= 0.03 && stats?.cagr <= 0.15, // 3% ~ 15% (小数形式)
  cagrIsSmallNumber: stats?.cagr < 1, // 小数形式而非百分数形式
  maxDrawdownInRange: stats?.maxDrawdown >= -0.6 && stats?.maxDrawdown <= -0.05, // -60% ~ -5%
  maxDrawdownIsNegative: stats?.maxDrawdown < 0,
  endingValueInRange: stats?.endingValue >= 15000 && stats?.endingValue <= 60000,
  volatilityReasonable: stats?.volatility > 0.05 && stats?.volatility < 0.3,
  drawdownEpisodesExist:
    Array.isArray(data?.data?.portfolios?.[0]?.drawdownEpisodes) &&
    data.data.portfolios[0].drawdownEpisodes.length > 0,
  drawdownEpisodeHasAllFields: (() => {
    const ep = data?.data?.portfolios?.[0]?.drawdownEpisodes?.[0];
    if (!ep) return false;
    return (
      typeof ep.peakDate === 'string' &&
      typeof ep.troughDate === 'string' &&
      typeof ep.depth === 'number' &&
      typeof ep.daysToTrough === 'number' &&
      typeof ep.totalDurationDays === 'number'
    );
  })(),
  growthCurveExists: (data?.data?.portfolios?.[0]?.growthCurve?.length ?? 0) > 100,
  drawdownCurveExists: (data?.data?.portfolios?.[0]?.drawdownCurve?.length ?? 0) > 100,
};

const failed = Object.entries(assertions).filter(([, v]) => !v);

console.log(
  JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      actual: {
        cagr: stats?.cagr,
        maxDrawdown: stats?.maxDrawdown,
        endingValue: stats?.endingValue,
        volatility: stats?.volatility,
        drawdownEpisodeCount: data?.data?.portfolios?.[0]?.drawdownEpisodes?.length,
        growthCurvePoints: data?.data?.portfolios?.[0]?.growthCurve?.length,
        firstDrawdownEpisode: data?.data?.portfolios?.[0]?.drawdownEpisodes?.[0],
      },
      assertions,
      status: failed.length === 0 ? 'PASS' : 'FAIL',
      failedAssertions: failed.map(([k]) => k),
    },
    null,
    2,
  ),
);

process.exit(failed.length === 0 ? 0 : 1);
```

**完成条件**：

- 运行 `node scripts/verify-backtest-contract.mjs`，输出 JSON
- 当前状态大概率是 FAIL（这就是我们要修的问题）
- 报告存到 `docs/audit/reports/p0-0-3-baseline.json`

### P0-0-4：创建 DOM 健康度检查脚本

**文件**：`scripts/audit-page-dom.mjs`

这个脚本用 Playwright 打开一个页面，执行标准化的健康度检查。

```javascript
#!/usr/bin/env node
import { chromium } from 'playwright';

const PAGES = [
  { slug: 'backtest', path: '/' },
  { slug: 'analysis', path: '/analysis' },
  { slug: 'monte-carlo', path: '/monte-carlo' },
  { slug: 'optimizer', path: '/optimizer' },
  { slug: 'efficient-frontier', path: '/efficient-frontier' },
  { slug: 'tactical', path: '/tactical' },
  { slug: 'tactical-grid', path: '/tactical-grid' },
  { slug: 'signal', path: '/signal-analyzer' },
  { slug: 'dual-signal', path: '/dual-signal' },
  { slug: 'multi-signal', path: '/multi-signal' },
  { slug: 'pca', path: '/pca' },
  { slug: 'letf', path: '/letf' },
  { slug: 'factor-regression', path: '/factor-regression' },
  { slug: 'goal-optimizer', path: '/goal-optimizer' },
  { slug: 'calculators', path: '/calculators' },
  { slug: 'lumpsum-dca', path: '/lumpsum-vs-dca' },
  { slug: 'rebalancing', path: '/rebalancing-sensitivity' },
  { slug: 'data-engine', path: '/data-engine' },
  { slug: 'about', path: '/about' },
  { slug: 'help', path: '/help' },
  { slug: 'pricing', path: '/pricing' },
];

const BASE = process.env.BASE_URL ?? 'http://localhost:15173';

const browser = await chromium.launch();
const results = [];

for (const page of PAGES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  try {
    await p.goto(`${BASE}${page.path}`, { waitUntil: 'networkidle', timeout: 15000 });
    await p.waitForTimeout(1500);

    const audit = await p.evaluate(() => {
      // ---- 检测 H1 数量 ----
      const h1s = Array.from(document.querySelectorAll('h1'));

      // ---- 检测 i18n key 泄露 ----
      const allText = Array.from(document.querySelectorAll('*'))
        .filter((el) => el.children.length === 0)
        .map((el) => (el.textContent ?? '').trim())
        .filter(Boolean);
      const i18nLeaked = allText.filter(
        (t) =>
          /^(common|portfolio|nav|backtest|analysis|montecarlo|optimizer|tactical|signal|hero|footer|action|params|results|chart|table|drawdown|stats|auth|billing|admin)\.[a-zA-Z]/.test(
            t,
          ) && t.length < 80,
      );

      // ---- 检测 NaN / undefined 文本 ----
      const nanTexts = allText.filter(
        (t) => /\bNaN\b|\bundefined\b|\bnull\b/.test(t) && !t.includes('http'),
      );

      // ---- 检测大片空白（>200px 连续无内容） ----
      const emptyRegions = [];
      const scrollHeight = document.documentElement.scrollHeight;
      const step = 50;
      let lastContentY = 0;
      for (let y = 0; y < scrollHeight; y += step) {
        const el = document.elementFromPoint(window.innerWidth / 2, y);
        const hasContent =
          el &&
          el.textContent &&
          el.textContent.trim().length > 0 &&
          el.tagName !== 'HTML' &&
          el.tagName !== 'BODY' &&
          el.tagName !== 'MAIN' &&
          el.tagName !== 'SECTION' &&
          el.tagName !== 'DIV';
        if (hasContent) {
          if (y - lastContentY > 200) {
            emptyRegions.push({ start: lastContentY, end: y, height: y - lastContentY });
          }
          lastContentY = y;
        }
      }

      // ---- 检测重复标题 ----
      const titleTexts = h1s.map((h) => (h.textContent ?? '').trim());
      const duplicateH1 = titleTexts.length > 1 && new Set(titleTexts).size < titleTexts.length;

      // ---- 检测 Card 双层嵌套 ----
      const cards = document.querySelectorAll('[class*="rounded-xl"][class*="border"]');
      let nestedCardCount = 0;
      cards.forEach((card) => {
        const inner = card.querySelectorAll('[class*="rounded-xl"][class*="border"]');
        if (inner.length > 0) nestedCardCount++;
      });

      // ---- 检测硬编码颜色 ----
      // 略（放到静态代码审计中做）

      return {
        url: location.pathname,
        h1Count: h1s.length,
        h1Texts: titleTexts,
        duplicateH1,
        i18nLeakedCount: i18nLeaked.length,
        i18nLeakedSample: i18nLeaked.slice(0, 10),
        nanTextCount: nanTexts.length,
        nanTextSample: nanTexts.slice(0, 5),
        emptyRegionCount: emptyRegions.length,
        largestEmptyRegion: emptyRegions.reduce((max, r) => Math.max(max, r.height), 0),
        nestedCardCount,
        scrollHeight,
      };
    });

    await p.screenshot({
      path: `docs/audit/screenshots/p0-0-4-${page.slug}.png`,
      fullPage: true,
    });

    results.push({ ...page, ...audit, status: 'OK' });
  } catch (e) {
    results.push({ ...page, status: 'ERROR', error: e.message });
  } finally {
    await ctx.close();
  }
}

await browser.close();

const summary = {
  timestamp: new Date().toISOString(),
  totalPages: PAGES.length,
  pagesWithDuplicateH1: results.filter((r) => r.duplicateH1).length,
  pagesWithI18nLeak: results.filter((r) => r.i18nLeakedCount > 0).length,
  pagesWithNaN: results.filter((r) => r.nanTextCount > 0).length,
  pagesWithLargeEmptySpace: results.filter((r) => r.largestEmptyRegion > 300).length,
  pagesWithNestedCard: results.filter((r) => r.nestedCardCount > 0).length,
  details: results,
};

console.log(JSON.stringify(summary, null, 2));
```

**完成条件**：

- 该脚本可运行，输出结构化 JSON
- 报告存到 `docs/audit/reports/p0-0-4-baseline.json`
- 20+ 页面全部截图到 `docs/audit/screenshots/`

### P0-0-5：创建静态代码审计脚本

**文件**：`scripts/audit-code-static.mjs`

```javascript
#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

function grep(pattern, options = {}) {
  const flags = options.regex ? '-rEn' : '-rn';
  try {
    const cmd = `grep ${flags} "${pattern}" packages/frontend/src ${options.include ? options.include.map((i) => `--include='${i}'`).join(' ') : ''} ${options.exclude ? options.exclude.map((e) => `--exclude='${e}'`).join(' ') : ''} || true`;
    return execSync(cmd, { encoding: 'utf-8' }).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

const audits = {
  // 1. @deprecated 组件是否被 import
  deprecatedImports: grep('@deprecated', { include: ['*.tsx', '*.ts'] })
    .map((line) => {
      const file = line.split(':')[0];
      const componentName = file.match(/\/([A-Z][a-zA-Z]+)\.tsx$/)?.[1];
      if (!componentName) return null;
      const importers = grep(`import.*${componentName}`, {
        include: ['*.tsx', '*.ts'],
        exclude: [`${componentName}.tsx`],
      });
      return {
        file,
        componentName,
        importedIn: importers.length,
        importers: importers.slice(0, 5),
      };
    })
    .filter(Boolean)
    .filter((x) => x.importedIn > 0),

  // 2. V2 组件与非 V2 组件并存
  v2Components: (() => {
    const v2Files = grep('', { include: ['*V2.tsx'] }).map((l) => l.split(':')[0]);
    const dupes = [];
    for (const v2 of new Set(v2Files)) {
      const v1 = v2.replace(/V2\.tsx$/, '.tsx');
      const v1Exists = grep('', { include: [v1.split('/').pop()] }).length > 0;
      if (v1Exists) dupes.push({ v1, v2 });
    }
    return dupes;
  })(),

  // 3. 硬编码颜色 (#XXXXXX 除了 chart-theme.ts 和主题定义)
  hardcodedColors: grep('#[0-9a-fA-F]{6}', {
    regex: true,
    include: ['*.tsx', '*.ts'],
    exclude: ['chart-theme.ts', 'index.css'],
  }).slice(0, 30),

  // 4. 硬编码字号 (text-[XXpx])
  hardcodedFontSize: grep('text-\\[[0-9]+px\\]', { regex: true, include: ['*.tsx'] }).slice(0, 30),

  // 5. 硬编码宽度 (w-[XXXpx]) — 仅统计，不算问题
  fixedWidthUsage: grep('w-\\[[0-9]+px\\]', { regex: true, include: ['*.tsx'] }).length,

  // 6. 裸 Input (没有指定宽度)
  bareInputs: (() => {
    const allInputs = grep('<Input', { include: ['*.tsx'] });
    return allInputs
      .filter((line) => {
        // 简单启发式：这一行如果没有 className 或 className 里没有 w- 就算裸
        return !line.includes('className') || !line.match(/className[^"]*"[^"]*w-/);
      })
      .slice(0, 20);
  })(),

  // 7. em-dash（应该用 hyphen）
  emDashInCode: grep('—', { include: ['*.tsx', '*.ts'], exclude: ['translation.json'] }).slice(
    0,
    20,
  ),

  // 8. Console.log 残留
  consoleLog: grep('console\\.', { regex: true, include: ['*.tsx', '*.ts'] })
    .filter((l) => !l.includes('// eslint-disable') && !l.includes('logger'))
    .slice(0, 20),

  // 9. TODO / FIXME
  todos: grep('TODO\\|FIXME\\|HACK\\|XXX', { regex: true, include: ['*.tsx', '*.ts'] }).length,

  // 10. 检测 h-screen 残留
  hScreen: grep('h-screen', { include: ['*.tsx'] }).slice(0, 10),

  // 11. bg-slate-*
  bgSlate: grep('bg-slate-\\|text-slate-', { regex: true, include: ['*.tsx'] }).slice(0, 20),

  // 12. 找出所有 max-w 使用
  maxWidthUsage: grep('max-w-\\[[0-9]+', { regex: true, include: ['*.tsx'] }).length,
};

const summary = {
  timestamp: new Date().toISOString(),
  criticalIssues: {
    deprecatedStillImported: audits.deprecatedImports.length,
    v1v2Coexist: audits.v2Components.length,
    bareInputs: audits.bareInputs.length,
    hardcodedColors: audits.hardcodedColors.length,
    consoleLogsInProduction: audits.consoleLog.length,
  },
  audits,
};

writeFileSync('docs/audit/reports/p0-0-5-code-audit.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary.criticalIssues, null, 2));
```

**完成条件**：

- 脚本可运行，输出报告到 `docs/audit/reports/p0-0-5-code-audit.json`
- 打印出的 criticalIssues 各项数字为 baseline

### P0-0-6：把所有验证脚本加到 package.json

```json
{
  "scripts": {
    "audit:i18n": "node scripts/verify-i18n.mjs",
    "audit:contract": "node scripts/verify-backtest-contract.mjs",
    "audit:dom": "node scripts/audit-page-dom.mjs",
    "audit:code": "node scripts/audit-code-static.mjs",
    "audit:all": "npm run audit:i18n && npm run audit:contract && npm run audit:dom && npm run audit:code"
  }
}
```

## P0-0 Checklist

- [ ] 4 个审计脚本创建完成
- [ ] `docs/audit/` 目录结构建立
- [ ] 首次运行 `npm run audit:all`，全部有 JSON 输出（即使 FAIL）
- [ ] `docs/audit/reports/p0-0-3-baseline.json` 存在
- [ ] `docs/audit/reports/p0-0-4-baseline.json` 存在
- [ ] `docs/audit/reports/p0-0-5-code-audit.json` 存在
- [ ] 20+ 页面 baseline 截图存在

---

## P0-1：数据契约修复（并行 - 分 3 个子智能体）

**子智能体 P0-1-A**（后端 Go 引擎）
**子智能体 P0-1-B**（Shared types + 前端渲染）
**子智能体 P0-1-C**（回撤片段完整字段）

三个可**并行开工**，但 B 依赖 A 的字段定义先落地，所以 A 先提交、B/C 再跟进。

### P0-1-A：Go 引擎 Statistics 字段单位标准化

**背景**：当前 API 返回的 CAGR / MaxDrawdown / Volatility 等字段单位可能不一致，前端渲染出 `0.07%` 这种错误。

**任务**：

1. 打开 `engine-go/internal/engine/statistics_returns.go` 和 `statistics_risk.go`
2. 检查每个字段的**返回单位**并对齐到：
   - **比率类字段（小数形式）**：`cagr`, `maxDrawdown`, `avgDrawdown`, `volatility`, `mwrr`, `cumulativeReturn`, `bestYear`, `worstYear` → 全部返回**小数**（如 0.0918 表示 9.18%）
   - **无单位数值**：`sharpe`, `sortino`, `calmar`, `ulcerIndex`, `upi`, `diversificationRatio`, `beta` → 直接数值
   - **金额**：`endingValue`, `totalContributions` → USD 数值
   - **天数**：`longestDrawdownDays` → 整数
3. 在每个字段的 Go struct 定义处**加注释**：`// UNIT: decimal ratio (0.05 = 5%)` 或 `// UNIT: USD` 或 `// UNIT: days`
4. **修改** `packages/shared/types/statistics.ts` 每个字段加同样的 JSDoc 注释

**自检脚本**（子智能体自己跑）：

```bash
npm run audit:contract > docs/audit/reports/p0-1-a-verify.json
cat docs/audit/reports/p0-1-a-verify.json | jq '.status'
# 期望输出 "PASS"
```

**具体验证条件**：

- 打开 Chrome DevTools MCP，访问 `http://localhost:15173`
- 填入默认参数（VTI 60% / BND 40%, 2010-01-01 至 2024-12-31）
- 点击运行回测
- 用 network 面板抓取 `/api/v1/backtest/portfolio` 的返回值
- 断言：
  - `response.data.portfolios[0].stats.cagr` 是 `0.05 ~ 0.12` 之间的数字
  - `response.data.portfolios[0].stats.maxDrawdown` 是 `-0.35 ~ -0.10` 之间的负数
  - `response.data.portfolios[0].stats.endingValue` 是 `15000 ~ 40000` 之间的数字
- 将 network 响应保存到 `docs/audit/network/p0-1-a-backtest-response.json`

### P0-1-B：前端渲染层单位适配

**依赖**：P0-1-A 完成后开始（或者在 A 定义好字段后并行）

**任务**：

1. **新建**：`packages/frontend/src/lib/formatters.ts`（如果 P0 之前已经创建则修改）

```typescript
/**
 * 数字格式化工具
 *
 * 契约：所有输入的比率字段（CAGR, MDD, Volatility 等）都是小数形式（0.05 = 5%）
 * 由 formatter 负责乘 100 和拼接 % 符号
 */

/** 输入 0.0918 → 输出 "9.18%" */
export function formatPercent(decimal: number | null | undefined, digits = 2): string {
  if (decimal == null || !Number.isFinite(decimal)) return '—';
  return `${(decimal * 100).toFixed(digits)}%`;
}

/** 输入 -0.2278 → 输出 "-22.78%" (负值) */
export function formatPercentSigned(decimal: number | null | undefined, digits = 2): string {
  if (decimal == null || !Number.isFinite(decimal)) return '—';
  const percent = decimal * 100;
  const sign = percent >= 0 ? '+' : '';
  return `${sign}${percent.toFixed(digits)}%`;
}

/** 输入 317424.56 → 输出 "$317,424.56" */
export function formatCurrency(value: number | null | undefined, currency = 'USD'): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** 输入 350000 → 输出 "$350,000" (无小数) */
export function formatCurrencyShort(value: number | null | undefined, currency = 'USD'): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/** 输入 1225 (天) → 输出 "3.4年" 或 "6月" 或 "12天" */
export function formatDuration(days: number | null | undefined): string {
  if (days == null || !Number.isFinite(days)) return '—';
  if (days < 30) return `${days}天`;
  if (days < 365) return `${Math.round(days / 30)}个月`;
  const years = days / 365;
  return `${years.toFixed(1)}年`;
}

/** 无单位数值（Sharpe/Sortino 等），保留 2 位小数 */
export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toFixed(digits);
}

/** 整数格式化 */
export function formatInteger(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return Math.round(value).toString();
}
```

2. **grep 所有旧的百分数渲染代码并替换**：

```bash
grep -rn "\.toFixed(2).*%" packages/frontend/src --include='*.tsx'
grep -rn "\`\${.*}%\`" packages/frontend/src --include='*.tsx'
```

对每一处：

- 判断源数据是"已 * 100 的百分数"还是"小数比率"
- 统一改为 `formatPercent(rawValue)`（假设源数据是小数比率）

3. **修改所有统计表/摘要组件**：使用 `formatters.ts` 而非行内格式化

4. **修改回撤图 Y 轴**：使用 `formatPercent` 作为 tickFormatter

**自检验证**：

- 使用 Chrome DevTools 打开回测页，运行默认回测
- 截图 `docs/audit/screenshots/p0-1-b-after-backtest.png`
- 执行 JS 断言：

```javascript
const cagrText = document.querySelector('[data-testid="stat-cagr"]')?.textContent ?? '';
const mddText = document.querySelector('[data-testid="stat-max-drawdown"]')?.textContent ?? '';
const results = {
  cagrText,
  mddText,
  cagrIsInRange:
    /^\d+\.\d+%$/.test(cagrText) && parseFloat(cagrText) >= 3 && parseFloat(cagrText) <= 15,
  mddIsNegativePercent:
    /^-\d+\.\d+%$/.test(mddText) && parseFloat(mddText) <= -5 && parseFloat(mddText) >= -50,
};
```

- 结果保存到 `docs/audit/reports/p0-1-b-verify.json`
- **必要条件**：`cagrIsInRange === true && mddIsNegativePercent === true`

**前置任务**：给所有关键统计元素添加 `data-testid`：

- 组合终值：`data-testid="stat-ending-value"`
- CAGR：`data-testid="stat-cagr"`
- MWRR：`data-testid="stat-mwrr"`
- 最大回撤：`data-testid="stat-max-drawdown"`
- 平均回撤：`data-testid="stat-avg-drawdown"`
- 波动率：`data-testid="stat-volatility"`
- 夏普：`data-testid="stat-sharpe"`
- 索提诺：`data-testid="stat-sortino"`
- 卡尔玛：`data-testid="stat-calmar"`
- Ulcer：`data-testid="stat-ulcer"`
- UPI：`data-testid="stat-upi"`
- 分散比：`data-testid="stat-diversification"`
- Beta：`data-testid="stat-beta"`

### P0-1-C：回撤片段字段补全 + NaN 修复

**任务**：

1. 阅读 `engine-go/internal/engine/statistics_drawdown.go`（或对应文件）
2. 确保 `DrawdownEpisode` struct 完整定义如下所有字段：

```go
type DrawdownEpisode struct {
    PeakDate          string   `json:"peakDate"`
    TroughDate        string   `json:"troughDate"`
    RecoveryDate      *string  `json:"recoveryDate,omitempty"`    // 可能未恢复
    Depth             float64  `json:"depth"`                      // UNIT: 小数比率，负值
    DaysToTrough      int      `json:"daysToTrough"`
    DaysToRecover     *int     `json:"daysToRecover,omitempty"`   // 可能未恢复
    TotalDurationDays int      `json:"totalDurationDays"`
    RecoveryFactor    *float64 `json:"recoveryFactor,omitempty"`
    PeriodCAGR        *float64 `json:"periodCAGR,omitempty"`      // UNIT: 小数比率
    PeriodUlcer       float64  `json:"periodUlcer"`
}
```

3. 实现 `buildEpisode` 函数（如果尚不完整），确保所有字段都被计算：

```go
func buildEpisode(prices []float64, dates []string, peakIdx, troughIdx, recoveryIdx int) DrawdownEpisode {
    depth := (prices[troughIdx] - prices[peakIdx]) / prices[peakIdx]
    daysToTrough := daysBetween(dates[peakIdx], dates[troughIdx])

    ep := DrawdownEpisode{
        PeakDate:     dates[peakIdx],
        TroughDate:   dates[troughIdx],
        Depth:        depth,
        DaysToTrough: daysToTrough,
    }

    if recoveryIdx > 0 {
        recDate := dates[recoveryIdx]
        daysToRec := daysBetween(dates[troughIdx], recDate)
        totalDays := daysBetween(dates[peakIdx], recDate)
        recFactor := float64(daysToRec) / float64(daysToTrough)
        periodCAGR := computeCAGR(prices[peakIdx], prices[recoveryIdx], float64(totalDays)/365.25)
        periodUlcer := computeUlcer(prices[peakIdx : recoveryIdx+1])

        ep.RecoveryDate = &recDate
        ep.DaysToRecover = &daysToRec
        ep.TotalDurationDays = totalDays
        ep.RecoveryFactor = &recFactor
        ep.PeriodCAGR = &periodCAGR
        ep.PeriodUlcer = periodUlcer
    } else {
        ep.TotalDurationDays = daysBetween(dates[peakIdx], dates[len(dates)-1])
        ep.PeriodUlcer = computeUlcer(prices[peakIdx:])
    }

    return ep
}
```

4. **前端** `DrawdownEpisodes` 组件（或 V2）修改：
   - 从 API 拿到 `daysToRecover` 后必须**判空**再计算：

```tsx
// ❌ 错误
const recoveryText = `${(episode.daysToRecover / 365).toFixed(1)}年`;

// ✅ 正确
const recoveryText =
  episode.daysToRecover != null ? formatDuration(episode.daysToRecover) : '未恢复';
```

- 所有"—"占位符替换为 `formatXxx(value)` 调用（formatter 内部会返回 "—" 当值为 null）

5. 单元测试：`engine-go/internal/engine/drawdown_test.go` 新增至少 3 个 case（未恢复段、快速恢复段、深度长期回撤段）

**自检**：

- 打开回测页运行默认回测
- 抓取 `/api/v1/backtest/portfolio` 响应
- 断言 `response.data.portfolios[0].drawdownEpisodes[0]` 包含以下所有字段：`peakDate, troughDate, depth, daysToTrough, totalDurationDays, periodUlcer`
- 若已恢复，还必须包含：`recoveryDate, daysToRecover, recoveryFactor, periodCAGR`
- DOM 断言：搜索页面所有文本，**不能出现 "NaN" 字样**

```javascript
const nanCount = Array.from(document.querySelectorAll('*')).filter(
  (el) => el.children.length === 0 && /\bNaN\b/.test(el.textContent ?? ''),
).length;
// 必要条件: nanCount === 0
```

- 截图 `docs/audit/screenshots/p0-1-c-drawdown-episodes.png`

## P0-1 Checklist

- [ ] P0-1-A: `npm run audit:contract` 输出 status = "PASS"
- [ ] P0-1-A: Go struct 每个字段有 UNIT 注释
- [ ] P0-1-A: shared types 同步更新
- [ ] P0-1-B: `formatters.ts` 创建，包含 7 个函数
- [ ] P0-1-B: 13 个 stat 元素有 `data-testid`
- [ ] P0-1-B: CAGR 显示为 `X.XX%`（如 "6.92%"），MDD 显示为 `-X.XX%`（如 "-22.78%"）
- [ ] P0-1-C: 回撤片段所有字段填充，无 "—" 出现在已恢复片段
- [ ] P0-1-C: 全页面无 "NaN" 出现
- [ ] git commit 消息 `fix(p0-1): normalize stat unit contract & fix drawdown fields`

---

## P0-2：i18n 补全与清理（并行 - 2 个子智能体）

### P0-2-A：补齐所有 undefined key

**任务**：

1. 运行 `npm run audit:i18n`，取输出中的 `undefinedInSource` 数组
2. 对每一个 key，在 `packages/frontend/src/i18n/locales/zh/translation.json` 和 `en/translation.json` 中**添加对应翻译**
3. 已知需要补的：
   - `common.equalize` → 中："均分" 英："Equalize"
   - `common.normalize` → 中："归一化" 英："Normalize"
   - `portfolio.deepAnalysis` → 中："深度分析" 英："Deep Analysis"
   - `portfolio.rebalance` → 中："再平衡" 英："Rebalance"
   - `portfolio.totalReturn` → 中："总回报" 英："Total Return"
   - `portfolio.drag` → 中："拖累" 英："Drag"
   - (其他从审计输出中补齐)
4. 运行 `npm run audit:i18n`，直到 status = "PASS"

**自检**：

- `npm run audit:i18n` 输出 `undefinedInSource: []`
- DOM 断言：全部 20+ 页面遍历后，找不到形如 `xxx.yyy` 的纯字面文本

### P0-2-B：清理未使用的 key + 建立 i18n 规范文档

**任务**：

1. 从 `unusedZh` 中，人工审核后**删除**不再使用的 key（避免翻译文件膨胀）
2. 创建 `docs/i18n-conventions.md`：

```markdown
# i18n 命名规范

## 命名规则

- `<page>.<section>.<field>`：如 `backtest.params.startDate`
- `common.<action>`：通用操作，如 `common.save`, `common.cancel`
- `nav.<item>`：导航项，如 `nav.backtest`
- `error.<code>`：错误信息

## 禁止

- 中文硬编码在组件中
- key 只加中文不加英文
- 使用 emdash (—) 在翻译文本中（改用 hyphen -）

## 添加流程

1. 在组件中 `t('foo.bar')`
2. 同时在 `zh/translation.json` 和 `en/translation.json` 添加
3. `npm run audit:i18n` 验证
```

## P0-2 Checklist

- [ ] `npm run audit:i18n` 输出 status = "PASS"，`undefinedInSource: []`, `missingInEn: []`, `missingInZh: []`
- [ ] `docs/i18n-conventions.md` 创建
- [ ] 主页 & 至少 5 个工具页 DOM 无 i18n key 泄露（截图 + JS 断言）

---

## P0-3：H1 重复与页面结构 audit（1 个子智能体）

**任务**：

1. 分析截图 1 的问题：Hero 区（"组合回测"大字）+ ToolPageLayout 区（"组合回测"小字）**H1 重复了**
2. 决策：**Hero 区保留 H1（大字），ToolPageLayout 的标题移除**
3. 阅读 `packages/frontend/src/components/layout/ToolPageLayout.tsx`
4. 该组件的 `title` prop 应改为**可选**，且在页面已经有 `<Hero>` 组件时**不渲染 title**
5. 或者：**移除 `ToolPageLayout` 内部的 title 渲染**（因为每个页面自己应该负责标题）

**决策路径**：

- **选项 A（默认）**：`ToolPageLayout` 只提供布局壳，不渲染标题。所有页面自己在 `params` 区域顶部渲染 `<Hero title="..." subtitle="..." />`
- **选项 B**：`ToolPageLayout` 保留 title，但在页面传 `hideTitle={true}` 时不渲染

**执行选项 A**：

1. 修改 `ToolPageLayout.tsx`，移除 title/description 渲染部分
2. 修改所有工具页，在 `params` 区顶部添加 `<PageHero />`
3. **删除**旧的重复标题渲染

**新建**：`packages/frontend/src/components/layout/PageHero.tsx`

```tsx
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface PageHeroProps {
  titleKey: string; // i18n key
  subtitleKey?: string;
  descriptionKey?: string;
  storageKey?: string; // 用于智能展开
  showExpandControl?: boolean; // 是否显示"展开介绍"按钮
  compact?: boolean; // 紧凑模式，H1 缩小
}

export function PageHero({
  titleKey,
  subtitleKey,
  descriptionKey,
  storageKey,
  showExpandControl = true,
  compact = false,
}: PageHeroProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (!storageKey) return;
    const count = parseInt(localStorage.getItem(storageKey) ?? '0');
    const newCount = count + 1;
    localStorage.setItem(storageKey, String(newCount));
    if (newCount > 3) setExpanded(false);
  }, [storageKey]);

  return (
    <div className="mb-8" data-testid="page-hero">
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1">
          <h1
            className={cn(compact ? 'text-h1' : 'text-display md:text-display-xl', 'text-fg')}
            data-testid="page-title"
          >
            {t(titleKey)}
          </h1>
          {subtitleKey && (
            <p className="mt-2 text-h2 text-fg-secondary font-normal max-w-[720px]">
              {t(subtitleKey)}
            </p>
          )}
        </div>
        {showExpandControl && descriptionKey && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="text-caption text-fg-tertiary hover:text-fg flex-shrink-0"
          >
            {expanded ? (
              <>
                {t('common.collapseIntro')} <ChevronUp className="h-4 w-4 ml-1" />
              </>
            ) : (
              <>
                {t('common.expandIntro')} <ChevronDown className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>
        )}
      </div>
      {expanded && descriptionKey && (
        <p className="text-body text-fg-tertiary max-w-[860px] leading-relaxed">
          {t(descriptionKey)}
        </p>
      )}
    </div>
  );
}
```

**替换所有工具页**：

```tsx
// 之前
<ToolPageLayout title="组合回测" description="回测投资组合、资产配置和退休现金流">
  <BacktestParams />
  ...
</ToolPageLayout>

// 之后
<ToolPageLayout>
  <PageHero
    titleKey="backtest.hero.title"
    subtitleKey="backtest.hero.subtitle"
    descriptionKey="backtest.hero.description"
    storageKey="hero-visits-backtest"
  />
  <BacktestParams />
  ...
</ToolPageLayout>
```

**自检验证**：

- 打开 20 个工具页，每个页面执行：

```javascript
{
  h1Count: document.querySelectorAll('h1').length,
  h1Texts: Array.from(document.querySelectorAll('h1')).map(h => h.textContent),
  hasPageHero: !!document.querySelector('[data-testid="page-hero"]'),
  hasPageTitle: !!document.querySelector('[data-testid="page-title"]'),
}
```

- **必要条件**：`h1Count === 1` 在所有页面上

- 截图对比：`docs/audit/screenshots/p0-3-before-{page}.png` vs `p0-3-after-{page}.png`

## P0-3 Checklist

- [ ] `PageHero` 组件创建，包含 `data-testid` 标记
- [ ] `ToolPageLayout` 内部不再渲染 title/description
- [ ] 20 个工具页全部替换为 `<PageHero>` + `<ToolPageLayout>`
- [ ] `npm run audit:dom` 输出 `pagesWithDuplicateH1: 0`
- [ ] 所有页面截图检查：H1 大字只有一处

---

## P0-4：空白空间彻底根治（1 个子智能体）

**任务**：

1. 从 `docs/audit/reports/p0-0-4-baseline.json` 中取所有 `largestEmptyRegion > 300` 的页面
2. 对每个页面用 Chrome DevTools 打开，滚动到问题空白区
3. 用 Elements 面板定位是**哪个元素撑出的空白**，常见原因：
   - `min-h-screen` 或 `h-dvh` 在错误的容器上
   - Footer 之前的 `<main>` 有 `flex-1` 但无内容
   - Card 有固定 `min-height` 但内容少
   - Chart 容器有固定 height 但数据为空

**修复原则**：

- **Footer 上方空白**：`<main>` 应该 `min-h-[calc(100dvh-var(--navbar-h)-var(--footer-h))]` 而不是 `min-h-screen`，且内容不足时不撑高
- **结果区卡片之间的空白**：所有 `<Card>` 使用 `space-y-6` 而不是 `mb-12` + `mt-12`
- **单组合右半屏空白**：`repeat(auto-fill, minmax(320px, 1fr))` 会撑满，改为 `repeat(auto-fit, minmax(320px, min(460px, 100%)))`。或者：单组合时不使用 grid，直接 `max-w-[460px]`
- **图表内部空白**：数据为空时显示 `<EmptyState>` 而不是空的 ResponsiveContainer

**具体待修复列表**（基于截图观察）：

**问题 4-1**：主页顶部大 Hero H1 (200px) 之下、"基本参数" Card 之前有约 120px 空白

- 定位：可能是 Hero 区的 padding-bottom 和 params 区的 padding-top 叠加
- 修复：Hero 的 `mb-8`（32px）应该足够，检查 `ToolPageLayout` 是否有额外 padding

**问题 4-2**：截图 3 - "组合价值走势"图下方到 60/40 图例之间有约 100px 空白

- 定位：GrowthChart 组件的图例位置错误
- 修复：图例应紧贴图表底部，`mt-2` 而不是 `mt-8`

**问题 4-3**：截图 4 - "回撤走势"图内部完全空白

- 定位：回撤图表接收到空数据，但仍然渲染了 400px 高度的空图
- 修复：加空数据检查 `if (data.length === 0) return <EmptyState message="暂无数据" />`

**问题 4-4**：截图 6 - Footer 之上大约 400px 纯黑空白

- 定位：`<main>` 的 min-height 过大
- 修复：改用 `min-h-[60vh]` 或去掉

**执行**：

1. 修改 `packages/frontend/src/components/layout/AppShell.tsx` 或类似的主布局
2. `<main>` 最外层容器改为：

```tsx
<main className="flex-1 min-h-0">
  {' '}
  {/* min-h-0 让 flex 子元素可缩 */}
  {children}
</main>
```

3. 修改 `GrowthChartV2`、`DrawdownChartV2`：数据为空时返回 `<ChartEmptyState />`
4. 新建 `ChartEmptyState` 组件：

```tsx
export function ChartEmptyState({ message = '暂无数据' }: { message?: string }) {
  return (
    <div className="h-[280px] flex items-center justify-center border border-dashed border-border-subtle rounded-lg">
      <div className="text-center text-fg-tertiary">
        <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-caption">{message}</p>
      </div>
    </div>
  );
}
```

5. 修改 `PortfolioEditor` grid：`grid-cols-[repeat(auto-fit,minmax(320px,min(460px,100%)))]` 且当 `portfolios.length === 1` 时不使用 grid：

```tsx
{portfolios.length === 1 ? (
  <div className="max-w-[460px]">
    <PortfolioCard ... />
  </div>
) : (
  <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
    {portfolios.map(p => <PortfolioCard ... />)}
  </div>
)}
```

**自检**：

- 运行 `npm run audit:dom`，`pagesWithLargeEmptySpace` 应从 baseline 下降至少 80%
- 主页滚动截图 `docs/audit/screenshots/p0-4-after-fullpage.png`，人工确认无明显空白
- 特别检查：
  - Footer 上方无 > 100px 黑色空白
  - 单组合时右半屏有明显信息或明确不使用（`max-w-[460px]`）
  - 图表容器不显示空图，改为 `<ChartEmptyState>`

## P0-4 Checklist

- [ ] `<main>` 布局修正
- [ ] `ChartEmptyState` 组件创建
- [ ] 3 个图表组件加空数据判断
- [ ] `PortfolioEditor` 单组合特殊处理
- [ ] `npm run audit:dom` 结果 `pagesWithLargeEmptySpace <= 2`
- [ ] 主页 fullpage 截图确认无明显浪费空间

---

## P0-5：删除 V1 组件残留（1 个子智能体）

**任务**：

1. 取 `docs/audit/reports/p0-0-5-code-audit.json` 中的 `v2Components` 数组
2. 对每一对 `{ v1, v2 }`：
   - `grep -rn "from.*\\b{V1组件名}\\b" packages/frontend/src` 确认 V1 是否还被 import
   - 如果 V1 已被完全替换 → **删除 V1 文件**
   - 如果 V1 还有引用 → 检查是否是"漏改"，替换掉后删除
3. 取 `deprecatedImports` 数组，对每一个还被 import 的 @deprecated 组件：
   - 找出所有 importer 页面
   - 替换为 V2 组件
   - 删除 V1 组件文件

**特别关注**（基于之前 plan 创建的可能存在的 V2）：

- `PortfolioCard.tsx` vs `PortfolioCardV2.tsx`
- `StatisticsTable.tsx` vs `StatisticsTableV2.tsx`
- `GrowthChart.tsx` vs `GrowthChartV2.tsx`
- `DrawdownChart.tsx` vs `DrawdownChartV2.tsx`
- `DrawdownEpisodes.tsx` vs `DrawdownEpisodesV2.tsx`

**自检**：

- `npm run audit:code` 输出 `v1v2Coexist: 0`
- `npm run audit:code` 输出 `deprecatedStillImported: 0`
- `pnpm build` 通过
- `pnpm test` 通过

## P0-5 Checklist

- [ ] 所有 V1 组件（在有 V2 版本时）已删除
- [ ] 所有 `@deprecated` 组件已删除或替换
- [ ] `pnpm build` 通过
- [ ] `pnpm test` 通过

---

## P0 阶段总验收

在所有 P0 子任务完成后，运行：

```bash
npm run audit:all > docs/audit/reports/p0-final.json
```

验收标准（写入 `docs/audit/P0-DONE.md`）：

- [ ] `verify-i18n.mjs` PASS
- [ ] `verify-backtest-contract.mjs` PASS
- [ ] `audit-page-dom.mjs`：
  - `pagesWithDuplicateH1: 0`
  - `pagesWithI18nLeak: 0`
  - `pagesWithNaN: 0`
  - `pagesWithLargeEmptySpace <= 2`
- [ ] `audit-code-static.mjs`：
  - `v1v2Coexist: 0`
  - `deprecatedStillImported: 0`
- [ ] git tag `v3.0-p0-complete`
- [ ] 主页截图人工确认：无重复 H1、无空白、无 NaN、无 i18n 泄露

---

# 阶段 P1：视觉与信息密度补齐（1 周）

**目标**：完成上一轮 plan 里"做了但做错"的所有 UI 项目

**并行度**：4-6 个子智能体

## P1-1：字号阶梯全站生效（1 个子智能体）

**任务**：

1. 打开每个页面，用 Chrome DevTools 查看 H1 的 computed font-size
2. 断言：
   - 主页 Hero H1: `font-size: 44px` (桌面), `32px` (< 768px)
   - 二级页面 H1（如 /monte-carlo）: 同上
   - 区块 H2（Card 顶部标题）: `font-size: 18px`
   - Card 内部 H3: `font-size: 15px`
3. 用 `grep -rn "text-\[[0-9]" packages/frontend/src --include='*.tsx'` 找出所有硬编码字号
4. 替换为语义 token：`text-display-xl`, `text-h1`, `text-h2`, `text-h3`, `text-body`, `text-caption`, `text-label-tiny`

**自检 JS**：

```javascript
const h1 = document.querySelector('[data-testid="page-title"]');
const computedFontSize = h1 ? parseInt(getComputedStyle(h1).fontSize) : 0;
const isDesktop = window.innerWidth >= 768;
const expected = isDesktop ? 44 : 32;
const pass = Math.abs(computedFontSize - expected) <= 2;
```

## P1-2：Floating Label 输入组件全站生效（1 个子智能体）

**任务**：

1. 验证 `FloatingLabelInput`, `FloatingLabelSelect`, `FloatingLabelDate` 三个组件存在
2. 打开主页参数区，DOM 检查：
   - "开始日期" 输入框应该有 floating label（label 在 input 内部左上角）
   - Label 字号应为 11px 大写
3. 如果不是 floating label → 说明 P2 未完成，本任务需要完成 P2 未做完的部分
4. 检查所有工具页参数区，全部使用 Floating Label

**验收截图**：`docs/audit/screenshots/p1-2-{page}-params.png`

**自检**：

```javascript
const dateInputs = document.querySelectorAll('input[type="date"]');
const labels = Array.from(dateInputs).map((input) => {
  const container = input.closest('.relative');
  const label = container?.querySelector('label');
  return {
    hasLabel: !!label,
    labelFontSize: label ? parseInt(getComputedStyle(label).fontSize) : 0,
    labelIsUppercase: label ? getComputedStyle(label).textTransform === 'uppercase' : false,
    labelPositionTop: label ? label.offsetTop : -1,
  };
});
```

## P1-3：Portfolio 卡片对象化验收（1 个子智能体）

**任务**：

1. 打开主页，添加一个组合（默认 60/40 VTI+BND）
2. DOM 断言：

```javascript
const cards = document.querySelectorAll('[data-testid="portfolio-card"]');
const results = Array.from(cards).map((card) => {
  const rect = card.getBoundingClientRect();
  return {
    width: rect.width,
    inRange: rect.width >= 320 && rect.width <= 460,
    hasHeader: !!card.querySelector('[data-testid="portfolio-header"]'),
    hasConfigRow: !!card.querySelector('[data-testid="portfolio-config"]'),
    hasAssetsList: !!card.querySelector('[data-testid="portfolio-assets"]'),
    hasFooter: !!card.querySelector('[data-testid="portfolio-footer"]'),
    hasDeepAnalysisMenu: !!card.querySelector('[data-testid="deep-analysis-menu"]'),
    hasColorStripe: !!card.querySelector('[data-testid="portfolio-color-stripe"]'),
  };
});
```

3. 添加 3 个组合，验证：
   - 3 张卡片在 1440px viewport 下**横向排列**（不是垂直堆叠）
   - `document.querySelector('[data-testid="portfolio-card"]:nth-child(2)').getBoundingClientRect().top === document.querySelector('[data-testid="portfolio-card"]:first-child').getBoundingClientRect().top`

**验收截图**：

- `docs/audit/screenshots/p1-3-single-portfolio.png`（单组合）
- `docs/audit/screenshots/p1-3-three-portfolios.png`（三组合横排）
- `docs/audit/screenshots/p1-3-six-portfolios.png`（六组合两行）

**必须补齐**：所有 `data-testid` 标记（如上）

## P1-4：统计表横向 17 列验收（1 个子智能体）

**任务**：

1. 打开主页，运行默认回测
2. 找到统计表，DOM 断言：

```javascript
const table = document.querySelector('[data-testid="statistics-table"]');
const headers = Array.from(table?.querySelectorAll('thead th') ?? []);
const rows = table?.querySelectorAll('tbody tr') ?? [];
const results = {
  hasTable: !!table,
  columnCount: headers.length,
  columnCountInRange: headers.length >= 15 && headers.length <= 20,
  headerTexts: headers.map((h) => h.textContent?.trim()),
  hasStickyFirstColumn: getComputedStyle(headers[0]).position === 'sticky',
  hasSortButtons: table?.querySelectorAll('thead button').length >= 10,
  rowCount: rows.length,
  firstRowCellCount: rows[0]?.children.length,
  firstCellHasColorDot: !!rows[0]?.querySelector('[data-testid="portfolio-color-dot"]'),
};
```

3. 期望：
   - `columnCount >= 15`
   - `hasStickyFirstColumn === true`
   - `hasSortButtons === true`

4. 添加第二个组合再回测，验证统计表变成 2 行（多组合叠加，而不是变成两个表）

**必须补齐 data-testid**：

- 表格容器：`data-testid="statistics-table"`
- 组合颜色圆点：`data-testid="portfolio-color-dot"`
- 每个 stat 单元格：`data-testid="stat-{key}"` （key 如 cagr, sharpe, mdd）

## P1-5：图表专业化验收（1 个子智能体）

**任务**：

1. 打开主页，运行默认回测
2. 检查组合价值走势图：

```javascript
const chart = document.querySelector('[data-testid="growth-chart"]');
const yAxisTicks = chart?.querySelectorAll('.recharts-yAxis .recharts-text');
const xAxisTicks = chart?.querySelectorAll('.recharts-xAxis .recharts-text');
const results = {
  yAxisFormat: Array.from(yAxisTicks ?? []).map((t) => t.textContent),
  yAxisIsFullCurrency: Array.from(yAxisTicks ?? []).every((t) =>
    /^\$[\d,]+/.test(t.textContent ?? ''),
  ), // $10,000 而非 10k
  xAxisFormat: Array.from(xAxisTicks ?? []).map((t) => t.textContent),
  xAxisIsYearOnly: Array.from(xAxisTicks ?? []).every((t) => /^\d{4}$/.test(t.textContent ?? '')), // 2010 而非 2010-01
  hasTimeRangeButtons: !!chart?.querySelector('[data-testid="chart-time-range"]'),
  hasLogScaleToggle: !!chart?.querySelector('[data-testid="chart-log-toggle"]'),
  hasDownloadMenu: !!chart?.querySelector('[data-testid="chart-download"]'),
  hasGridVertical: !!chart?.querySelector('.recharts-cartesian-grid-vertical line'),
  hasGridHorizontal: !!chart?.querySelector('.recharts-cartesian-grid-horizontal line'),
};
```

3. 期望：
   - `yAxisIsFullCurrency === true`
   - `xAxisIsYearOnly === true`
   - `hasGridVertical === true`（P0 计划里的双向网格）

**修复方向**（如未通过）：

- Y 轴 formatter 应使用 `CURRENCY_TICK_FORMATTER`（在 P0-5 chart-theme.ts 里定义）
- X 轴 formatter 应使用 `YEAR_ONLY_TICK_FORMATTER`
- `<CartesianGrid vertical={true} />`

**验收截图**：`docs/audit/screenshots/p1-5-growth-chart.png`

## P1-6：Navbar 3 分组验收（1 个子智能体）

**任务**：

1. 打开主页，检查 Navbar
2. DOM 断言：

```javascript
const navGroups = document.querySelectorAll('[data-testid="nav-group"]');
const directLinks = document.querySelectorAll('[data-testid="nav-direct"]');
const results = {
  groupCount: navGroups.length,
  directLinkCount: directLinks.length,
  groupLabels: Array.from(navGroups).map((g) => g.textContent?.trim()),
  directLabels: Array.from(directLinks).map((l) => l.textContent?.trim()),
  hasBellIcon: !!document.querySelector('[data-testid="notification-bell"]'),
  hasLangSelector: !!document.querySelector('[data-testid="language-selector"]'),
  hasThemeToggle: !!document.querySelector('[data-testid="theme-toggle"]'),
  hasCurrencySelector: !!document.querySelector('[data-testid="currency-selector"]'),
  hasPlanBadge: !!document.querySelector('[data-testid="plan-badge"]'),
  planBadgeText: document.querySelector('[data-testid="plan-badge"]')?.textContent?.trim(),
  hasPublicBadge: document.body.textContent?.includes('PUBLIC'), // 应为 false
};
```

3. 期望：
   - `groupCount === 3`（回测/分析优化/战术信号）
   - `directLinkCount >= 3`（数据引擎/文档/定价）
   - `hasPublicBadge === false`
   - `planBadgeText === 'FREE'`（未登录）或 'PRO' / 'PRO+'（已登录）

**注意**：截图显示当前是 "回测 / 分析优化 / 战术信号 / 数据引擎 / 文档 / 定价 / ZH / 🌙 / USD / 🔔 / 登录 / [头像]" — **这看起来已经做对了**。所以本任务主要是补 `data-testid` 让验收能自动化。

## P1 Checklist

- [ ] P1-1: 全站字号符合语义 token，`h1Count=1` 且 font-size=44px (桌面)
- [ ] P1-2: 参数区使用 Floating Label
- [ ] P1-3: Portfolio 卡片宽度 320-460px，横向排列
- [ ] P1-4: 统计表 15+ 列，sticky 首列，支持排序
- [ ] P1-5: 图表 Y 轴 `$XXX,XXX` 格式，X 轴纯年份，双向网格
- [ ] P1-6: Navbar 3 分组 + 无 PUBLIC 徽章
- [ ] git tag `v3.0-p1-complete`

---

阶段 P2：数据丰富度与差异化（1-2 周）— 完整重写
目标：

合成标的的 UI 展示与元数据接入
数据引擎页排序与布局修复
Footer 真实数据接入
Ticker 输入体验强化
并行度：3-4 个子智能体

P2-0：Ticker 元数据 API 就绪（1 个子智能体，前置）
背景：P2-1、P3-4 等任务都依赖 ticker 元数据。先把 API 建好。

任务
检查后端是否已有 /api/v1/data/ticker-meta 端点：

Bash

grep -rn "ticker-meta\|tickerMeta" packages/backend/src --include='*.ts'
如果不存在，新建：packages/backend/src/routes/dataRoutes.ts 中添加：

TypeScript

router.get('/ticker-meta', async (req, res) => {
const ticker = String(req.query.ticker ?? '').toUpperCase().trim();
if (!ticker) return res.status(400).json({ error: 'ticker required' });

try {
const meta = await tickerDataService.getMeta(ticker);
if (!meta) return res.status(404).json({ error: 'ticker not found' });

    res.json({
      data: {
        ticker: meta.ticker,
        name: meta.name,
        exchange: meta.exchange,
        currency: meta.currency,
        assetClass: meta.assetClass,           // stock / etf / index / synthetic
        isSynthetic: meta.ticker.endsWith('SIM'),
        earliestDate: meta.earliestDate,        // YYYY-MM-DD
        latestDate: meta.latestDate,
        dataPoints: meta.dataPoints,
        syntheticSources: meta.syntheticSources ?? null,   // 合成标的的拼接来源
      }
    });

} catch (err) {
logger.error({ err, ticker }, 'ticker-meta lookup failed');
res.status(500).json({ error: 'internal error' });
}
});
实现 tickerDataService.getMeta()：

从 tickers 表（或对应的 PostgreSQL 表）查询基础信息
从 prices 表 SELECT MIN(bar_date), MAX(bar_date), COUNT(*) WHERE ticker=$1
合成标的的 syntheticSources 从配置文件 data-fetcher/configs/synthetic_tickers.yaml 读取
shared types 增加：packages/shared/types/ticker.ts

TypeScript

export interface TickerMeta {
ticker: string;
name: string;
exchange: string;
currency: string;
assetClass: 'stock' | 'etf' | 'index' | 'synthetic' | 'crypto';
isSynthetic: boolean;
earliestDate: string;
latestDate: string;
dataPoints: number;
syntheticSources?: Array<{
source: string; // 如 "CRSP_TMI_TR"
from: string; // YYYY-MM-DD
to: string; // YYYY-MM-DD or "current"
}> | null;
}
完成状态
运行 curl 'http://localhost:15001/api/v1/data/ticker-meta?ticker=VTI' 返回 JSON 包含 name/earliestDate/latestDate/dataPoints
运行 curl 'http://localhost:15001/api/v1/data/ticker-meta?ticker=VTISIM' 返回 isSynthetic: true 和 syntheticSources 数组
运行 curl 'http://localhost:15001/api/v1/data/ticker-meta?ticker=INVALID' 返回 404
保存响应示例到 docs/audit/network/p2-0-ticker-meta-samples.json
P2-1：合成标的 UI 展示（1 个子智能体）
背景
从截图 8 看，数据引擎的"样本标的"区域列出了 VTISIM, SPYSIM, QQQSIM 等（可追溯至 1990 年代），说明后端已有合成标的。前端需要：

在 Ticker 输入框自动补全中把 SIM 标的标识出来
在合成标的 tooltip 中显示元数据（数据来源、拼接日期）
首页 Hero 区加"合成标的"推广栏
任务
步骤 1：修改 TickerInput 组件，加合成标的标识
文件：packages/frontend/src/components/TickerInput.tsx（或 TickerTagInput.tsx）

在自动补全下拉列表的每一项：

React

// 每个搜索结果项
<div className="flex items-center gap-2 px-3 py-2 hover:bg-hover" data-testid={`ticker-suggestion-${item.ticker}`}>
  {/* ticker 代码 */}
  <span className="font-mono text-body flex-1">{item.ticker}</span>

{/* 合成标的徽章 */}
{item.ticker.endsWith('SIM') && (
<span
className="text-micro font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full border border-brand/40 bg-brand-subtle/8 text-brand"
data-testid="synthetic-badge"
title={t('ticker.syntheticTooltip')} >
SIM
</span>
)}

{/* Asset class 徽章 */}
<span className="text-micro text-fg-tertiary">{item.assetClass?.toUpperCase()}</span>

{/* Name */}
<span className="text-caption text-fg-secondary truncate max-w-[300px]">{item.name}</span>
</div>
步骤 2：新建 SyntheticTickerTooltip 组件
文件：packages/frontend/src/components/SyntheticTickerTooltip.tsx

React

import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { FlaskConical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTickerMeta } from '@/hooks/useTickerMeta';

interface Props {
ticker: string;
children: React.ReactNode;
}

export function SyntheticTickerTooltip({ ticker, children }: Props) {
const { t } = useTranslation();
const meta = useTickerMeta(ticker);

if (!meta?.isSynthetic) return <>{children}</>;

return (
<TooltipProvider>
<Tooltip>
<TooltipTrigger asChild>{children}</TooltipTrigger>
<TooltipContent 
          className="max-w-[360px] p-4 bg-elevated border border-border-strong rounded-lg shadow-xl"
          data-testid="synthetic-tooltip"
        >
<div className="flex items-center gap-2 mb-2">
<FlaskConical className="h-4 w-4 text-brand" />
<span className="text-h3">{ticker}</span>
<span className="text-caption text-fg-tertiary">{t('ticker.synthetic')}</span>
</div>
<p className="text-caption text-fg-secondary mb-3">{meta.name}</p>

          {meta.syntheticSources && (
            <div className="space-y-1.5 border-t border-border-subtle pt-3">
              <div className="text-label-tiny text-fg-tertiary">{t('ticker.dataSources')}</div>
              {meta.syntheticSources.map((src, i) => (
                <div key={i} className="text-caption flex justify-between font-mono tabular-nums">
                  <span className="text-fg">{src.source}</span>
                  <span className="text-fg-tertiary">{src.from} → {src.to}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 pt-3 border-t border-border-subtle text-caption text-fg-tertiary">
            {t('ticker.historyRange', {
              from: meta.earliestDate,
              years: Math.floor((new Date().getTime() - new Date(meta.earliestDate).getTime()) / (365.25 * 24 * 3600 * 1000))
            })}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>

);
}
步骤 3：新建 useTickerMeta hook
文件：packages/frontend/src/hooks/useTickerMeta.ts

TypeScript

import { useState, useEffect } from 'react';
import type { TickerMeta } from '@shared/types/ticker';

const cache = new Map<string, TickerMeta | null>();
const pending = new Map<string, Promise<TickerMeta | null>>();

async function fetchMeta(ticker: string): Promise<TickerMeta | null> {
if (cache.has(ticker)) return cache.get(ticker) ?? null;
if (pending.has(ticker)) return pending.get(ticker)!;

const promise = fetch(`/api/v1/data/ticker-meta?ticker=${encodeURIComponent(ticker)}`)
.then(r => r.ok ? r.json() : null)
.then(json => {
const meta = json?.data ?? null;
cache.set(ticker, meta);
pending.delete(ticker);
return meta;
})
.catch(() => {
cache.set(ticker, null);
pending.delete(ticker);
return null;
});

pending.set(ticker, promise);
return promise;
}

export function useTickerMeta(ticker: string | undefined | null): TickerMeta | null {
const [meta, setMeta] = useState<TickerMeta | null>(() =>
ticker ? cache.get(ticker) ?? null : null
);

useEffect(() => {
if (!ticker || ticker.length < 1) {
setMeta(null);
return;
}

    let cancelled = false;
    fetchMeta(ticker.toUpperCase()).then(m => {
      if (!cancelled) setMeta(m);
    });

    return () => { cancelled = true; };

}, [ticker]);

return meta;
}
步骤 4：Portfolio 卡片中的 ticker 用 Tooltip 包裹
修改 AssetWeightRow.tsx：

React

<SyntheticTickerTooltip ticker={asset.ticker}>
  <Input
    value={asset.ticker}
    onChange={...}
    className={cn(INPUT_WIDTHS.ticker, 'font-mono uppercase h-9')}
    data-testid={`asset-ticker-input-${asset.ticker}`}
  />
</SyntheticTickerTooltip>
{tickerMeta?.isSynthetic && (
  <span className="text-micro px-1 py-0.5 rounded bg-brand-subtle/10 text-brand" data-testid="asset-sim-badge">
    SIM
  </span>
)}
步骤 5：首页 Hero 区加合成标的推广栏
修改 PageHero.tsx（或在主页 BacktestHero.tsx 内）：

在三栏能力展示下方增加一个横条：

React

<div 
  className="mt-6 p-4 bg-brand-subtle/6 border border-brand/20 rounded-lg flex items-center gap-4"
  data-testid="synthetic-promo"
>
  <div className="flex-shrink-0 p-2 bg-brand-subtle/10 rounded-lg">
    <FlaskConical className="h-5 w-5 text-brand" />
  </div>
  <div className="flex-1">
    <div className="text-body font-medium text-fg">
      {t('hero.syntheticPromo.title')}
    </div>
    <div className="text-caption text-fg-secondary mt-0.5">
      {t('hero.syntheticPromo.description')}
    </div>
  </div>
  <Link 
    to="/data-engine#synthetic" 
    className="text-caption text-brand hover:underline flex items-center gap-1"
  >
    {t('hero.syntheticPromo.cta')} <ArrowRight className="h-3 w-3" />
  </Link>
</div>
步骤 6：i18n 补齐
zh/translation.json：

JSON

{
"ticker": {
"synthetic": "合成标的",
"syntheticTooltip": "由多个数据源拼接而成，可回测更长历史",
"dataSources": "数据来源",
"historyRange": "历史起始: {{from}}（约 {{years}} 年）"
},
"hero": {
"syntheticPromo": {
"title": "合成标的可将 60/40 回测拓展至 40 年以上",
"description": "VTISIM · BNDSIM · SPYSIM 等 20+ 合成标的已就绪",
"cta": "查看全部"
}
}
}
英文对应翻译。

完成状态（可截图 + JS 验证）
主页 Hero 区包含合成标的推广栏

JavaScript

const promo = document.querySelector('[data-testid="synthetic-promo"]');
const results = {
hasPromo: !!promo,
promoText: promo?.textContent,
hasCtaLink: !!promo?.querySelector('a[href*="data-engine"]'),
};
// 期望: hasPromo=true, promoText 包含"合成标的", hasCtaLink=true
Ticker 自动补全中 SIM 标的有徽章

打开主页 → 点击"添加标的" → 输入 "VTI"
等待自动补全下拉出现
JS 断言：
JavaScript

const vtisimSuggestion = document.querySelector('[data-testid="ticker-suggestion-VTISIM"]');
const hasSimBadge = !!vtisimSuggestion?.querySelector('[data-testid="synthetic-badge"]');
组合中输入 VTISIM 后卡片显示 SIM 徽章

JavaScript

// 前提：已添加 VTISIM 到组合
const simBadgeCount = document.querySelectorAll('[data-testid="asset-sim-badge"]').length;
// 期望: 至少 1 个
Tooltip 内容验证

hover VTISIM 输入框
等待 800ms
JS 断言：
JavaScript

const tooltip = document.querySelector('[data-testid="synthetic-tooltip"]');
const results = {
hasTooltip: !!tooltip,
tooltipText: tooltip?.textContent,
containsSource: tooltip?.textContent?.includes('CRSP') || tooltip?.textContent?.includes('SPY'),
containsDate: /\d{4}-\d{2}-\d{2}/.test(tooltip?.textContent ?? ''),
};
截图：

docs/audit/screenshots/p2-1-hero-with-promo.png（首页含推广栏）
docs/audit/screenshots/p2-1-ticker-autocomplete-sim.png（自动补全含 SIM 徽章）
docs/audit/screenshots/p2-1-portfolio-with-sim.png（组合含 VTISIM + 徽章）
docs/audit/screenshots/p2-1-synthetic-tooltip.png（tooltip 展开）
完成 Checklist
useTickerMeta.ts hook 创建
SyntheticTickerTooltip.tsx 组件创建
TickerInput 自动补全含 SIM 徽章
AssetWeightRow 合成标的加徽章
首页 Hero 区含合成标的推广栏
i18n 中英双语补齐
npm run audit:i18n PASS
4 张截图完成
全部 JS 断言 PASS
P2-2：Footer 数据接入（1 个子智能体）
背景
从截图 6 看，Footer "覆盖标的" 显示为 "— 个"，说明前端没接后端数据。

任务
步骤 1：确认后端 /api/v1/data/meta 端点
Bash

grep -rn "/data/meta\|dataMeta" packages/backend/src --include='*.ts'
如果不存在，新建：

文件：packages/backend/src/routes/dataRoutes.ts

TypeScript

router.get('/meta', async (req, res) => {
try {
// 缓存 5 分钟
const cacheKey = 'data:meta';
const cached = await redisClient.get(cacheKey);
if (cached) return res.json({ data: JSON.parse(cached) });

    const meta = await Promise.all([
      db.query('SELECT MAX(bar_date)::text AS latest FROM prices'),
      db.query('SELECT MIN(bar_date)::text AS earliest FROM prices'),
      db.query('SELECT COUNT(*)::int AS ticker_count FROM tickers'),
      db.query('SELECT COUNT(*)::int AS data_points FROM prices'),
      db.query(`
        SELECT
          COUNT(*) FILTER (WHERE market = 'US')::int AS us,
          COUNT(*) FILTER (WHERE market = 'A_SHARE')::int AS a_share,
          COUNT(*) FILTER (WHERE asset_class = 'stock')::int AS stocks,
          COUNT(*) FILTER (WHERE asset_class = 'etf')::int AS etfs,
          COUNT(*) FILTER (WHERE asset_class = 'index')::int AS indices,
          COUNT(*) FILTER (WHERE ticker LIKE '%SIM')::int AS synthetic
        FROM tickers
      `),
    ]);

    const result = {
      lastUpdated: meta[0].rows[0].latest,
      earliestDate: meta[1].rows[0].earliest,
      tickerCount: meta[2].rows[0].ticker_count,
      dataPoints: meta[3].rows[0].data_points,
      breakdown: {
        us: meta[4].rows[0].us,
        aShare: meta[4].rows[0].a_share,
        stocks: meta[4].rows[0].stocks,
        etfs: meta[4].rows[0].etfs,
        indices: meta[4].rows[0].indices,
        synthetic: meta[4].rows[0].synthetic,
      },
    };

    await redisClient.set(cacheKey, JSON.stringify(result), 'EX', 300);
    res.json({ data: result });

} catch (err) {
logger.error({ err }, 'data meta lookup failed');
res.status(500).json({ error: 'internal error' });
}
});
步骤 2：前端 useDataMeta hook
文件：packages/frontend/src/hooks/useDataMeta.ts

TypeScript

import { useState, useEffect } from 'react';

interface DataMeta {
lastUpdated: string;
earliestDate: string;
tickerCount: number;
dataPoints: number;
breakdown: {
us: number;
aShare: number;
stocks: number;
etfs: number;
indices: number;
synthetic: number;
};
}

let cachedMeta: DataMeta | null = null;
let lastFetch = 0;
const TTL = 5 * 60 * 1000; // 5 分钟

export function useDataMeta(): DataMeta | null {
const [meta, setMeta] = useState<DataMeta | null>(cachedMeta);

useEffect(() => {
const now = Date.now();
if (cachedMeta && now - lastFetch < TTL) {
setMeta(cachedMeta);
return;
}

    fetch('/api/v1/data/meta')
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (json?.data) {
          cachedMeta = json.data;
          lastFetch = now;
          setMeta(json.data);
        }
      })
      .catch(() => {});

}, []);

return meta;
}
步骤 3：Footer 组件接入
文件：packages/frontend/src/components/layout/Footer.tsx

在"数据"栏中替换硬编码 "—"：

React

function DataStatsColumn() {
const meta = useDataMeta();

return (
<div>
<h4 className="text-label-tiny text-fg-tertiary mb-3">{t('footer.data')}</h4>
<div className="space-y-2 text-caption text-fg-tertiary">
<div>
<div className="text-fg-secondary">{t('footer.dataSources')}</div>
<div>yfinance · finnhub · akshare · BaoStock</div>
</div>
<div>
<div className="text-fg-secondary">{t('footer.dataUpdate')}</div>
<div className="font-mono" data-testid="footer-data-update">
{meta?.lastUpdated ?? '—'}
</div>
</div>
<div>
<div className="text-fg-secondary">{t('footer.dataHistory')}</div>
<div className="font-mono" data-testid="footer-data-history">
{meta?.earliestDate ? `${meta.earliestDate.slice(0,4)} 起` : '—'}
</div>
</div>
<div>
<div className="text-fg-secondary">{t('footer.dataCoverage')}</div>
<div className="font-mono" data-testid="footer-data-coverage">
{meta?.tickerCount ? `${meta.tickerCount.toLocaleString()} 个` : '—'}
</div>
</div>
</div>
</div>
);
}
完成状态
API 端点存在

Bash

curl 'http://localhost:15001/api/v1/data/meta' | jq

# 期望：返回 data.lastUpdated 是 YYYY-MM-DD 格式

# data.tickerCount 是大于 100 的整数

Footer 显示真实数据

JavaScript

const results = {
dataUpdate: document.querySelector('[data-testid="footer-data-update"]')?.textContent,
dataCoverage: document.querySelector('[data-testid="footer-data-coverage"]')?.textContent,
dataUpdateIsDate: /^\d{4}-\d{2}-\d{2}$/.test(
document.querySelector('[data-testid="footer-data-update"]')?.textContent ?? ''
),
dataCoverageHasNumber: /\d+/.test(
document.querySelector('[data-testid="footer-data-coverage"]')?.textContent ?? ''
),
};
// 期望: dataUpdateIsDate=true, dataCoverageHasNumber=true
截图：docs/audit/screenshots/p2-2-footer-with-data.png

完成 Checklist
后端 /api/v1/data/meta 端点存在，返回真实数据
useDataMeta hook 创建，5 分钟缓存
Footer 4 项数据（更新日期/历史深度/覆盖标的/数据来源）显示真实值
全部 JS 断言 PASS
截图人工确认无 "—"
P2-3：数据引擎页排序与布局修复（1 个子智能体）
背景
从截图 8 看，"数据年限分布" 柱状图 X 轴顺序是 0-4年 → 10-14年 → 15-19年 → 20-24年 → 25-29年 → 30-34年 → 40-44年 → 5-9年 → 50-54年 → 60-64年，这是字典序而非数值序。

从截图 9 看，"最近更新" 卡片是空的。

任务
步骤 1：修复 X 轴排序
文件：packages/frontend/src/pages/data-engine/DataEngineCharts.tsx（或类似）

TypeScript

// 在组件顶部定义
const AGE_BUCKET_ORDER = [
'0-4年', '5-9年', '10-14年', '15-19年',
'20-24年', '25-29年', '30-34年', '35-39年',
'40-44年', '45-49年', '50-54年', '55-59年', '60-64年'
];

// 或者：如果数据用英文
const AGE_BUCKET_ORDER_EN = [
'0-4y', '5-9y', '10-14y', '15-19y',
'20-24y', '25-29y', '30-34y', '35-39y',
'40-44y', '45-49y', '50-54y', '55-59y', '60-64y'
];

function sortByAge(data: Array<{ label: string; count: number }>) {
const order = AGE_BUCKET_ORDER;
return [...data].sort((a, b) => {
const ai = order.indexOf(a.label);
const bi = order.indexOf(b.label);
// 找不到的放最后
return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
});
}

// 使用
const sortedData = sortByAge(rawData);
对"数据起始年代分布"同理，用年代序：['1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s']

步骤 2：修复"最近更新"卡片
文件：packages/frontend/src/pages/data-engine/RecentUpdatesCard.tsx

React

import { useState, useEffect } from 'react';

interface RecentUpdate {
ticker: string;
name: string;
lastBarDate: string;
updatedAt: string;
}

export function RecentUpdatesCard() {
const [updates, setUpdates] = useState<RecentUpdate[]>([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
fetch('/api/v1/data/recent-updates?limit=10')
.then(r => r.json())
.then(json => setUpdates(json.data ?? []))
.catch(() => setUpdates([]))
.finally(() => setLoading(false));
}, []);

return (
<div 
      className="bg-surface border border-border rounded-xl p-5"
      data-testid="recent-updates-card"
    >
<h3 className="text-h3 mb-4">最近更新</h3>

      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="h-8 bg-input-bg animate-pulse rounded" />
          ))}
        </div>
      ) : updates.length === 0 ? (
        <div className="text-caption text-fg-tertiary text-center py-6">
          暂无更新记录
        </div>
      ) : (
        <div className="space-y-1">
          {updates.map(u => (
            <div
              key={u.ticker}
              className="flex items-center gap-3 py-2 px-2 -mx-2 rounded hover:bg-hover"
              data-testid={`recent-update-${u.ticker}`}
            >
              <span className="font-mono text-body text-fg w-20 flex-shrink-0">{u.ticker}</span>
              <span className="text-caption text-fg-secondary truncate flex-1">{u.name}</span>
              <span className="text-caption text-fg-tertiary font-mono tabular-nums">
                {u.lastBarDate}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>

);
}
后端新增 /api/v1/data/recent-updates：

TypeScript

router.get('/recent-updates', async (req, res) => {
const limit = Math.min(parseInt(String(req.query.limit ?? '10')), 50);

const result = await db.query(`     SELECT t.ticker, t.name, MAX(p.bar_date)::text AS last_bar_date, MAX(p.updated_at) AS updated_at
    FROM prices p
    JOIN tickers t ON t.ticker = p.ticker
    GROUP BY t.ticker, t.name
    ORDER BY MAX(p.updated_at) DESC NULLS LAST
    LIMIT $1
  `, [limit]);

res.json({
data: result.rows.map(r => ({
ticker: r.ticker,
name: r.name,
lastBarDate: r.last_bar_date,
updatedAt: r.updated_at,
}))
});
});
完成状态
X 轴排序正确

JavaScript

const chart = document.querySelector('[data-testid="chart-data-age-distribution"]');
const xLabels = Array.from(chart?.querySelectorAll('.recharts-xAxis .recharts-text') ?? [])
.map(t => t.textContent?.trim());

const expectedOrder = ['0-4年', '5-9年', '10-14年', '15-19年', '20-24年'];
const firstFive = xLabels.slice(0, 5);
const isCorrectOrder = expectedOrder.every((v, i) => firstFive[i] === v);
"最近更新"卡片有内容

JavaScript

const card = document.querySelector('[data-testid="recent-updates-card"]');
const items = card?.querySelectorAll('[data-testid^="recent-update-"]');
const results = {
hasCard: !!card,
itemCount: items?.length ?? 0,
hasContent: (items?.length ?? 0) > 0,
};
// 期望：hasContent=true, itemCount >= 5
截图：

docs/audit/screenshots/p2-3-data-age-distribution.png（X 轴数值序）
docs/audit/screenshots/p2-3-recent-updates.png（含 5+ 条更新）
完成 Checklist
AGE_BUCKET_ORDER 常量定义并使用
数据年限分布 X 轴按数值序
数据起始年代分布 X 轴按年代序
RecentUpdatesCard 组件创建
后端 /recent-updates 端点存在
截图确认无空白卡片
阶段 P3：产品活力信号与深度交互（2 周）— 完整重写
目标：

Announcements（产品公告）系统全流程
Sticky Action Bar（结果区悬浮操作栏）
回撤片段的时间轴可视化打磨（P0-1-C 之上的视觉强化）
多组合对比模式（图表 + 表格联动）
并行度：4 个子智能体（P3-1 到 P3-4 完全独立）

P3-1：Announcements 系统全流程（1 个子智能体）
背景
testfol.io 有一个"产品动态"抽屉，点击铃铛图标弹出，显示 100+ 条历史更新。这是产品活力的核心信号——让用户感觉平台在持续迭代。

任务
步骤 1：数据库迁移
新建文件：migrations/028_announcements.sql

SQL

CREATE TABLE announcements (
id SERIAL PRIMARY KEY,
slug VARCHAR(64) UNIQUE NOT NULL,
title_zh TEXT NOT NULL,
title_en TEXT NOT NULL,
body_zh TEXT NOT NULL,
body_en TEXT NOT NULL,
cta_label_zh VARCHAR(128),
cta_label_en VARCHAR(128),
cta_link VARCHAR(255),
variant VARCHAR(16) NOT NULL DEFAULT 'info', -- info/success/warning/feature
published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_announcements_published ON announcements(published_at DESC);
CREATE INDEX idx_announcements_slug ON announcements(slug);
运行：

Bash

psql $DATABASE_URL -f migrations/028_announcements.sql
步骤 2：初始数据填充脚本
新建：scripts/seed-announcements.mjs

JavaScript

#!/usr/bin/env node
import pg from 'pg';

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const seed = [
{
slug: 'v3-launch',
title_zh: 'v3.0 全站视觉升级完成',
title_en: 'v3.0 UI Overhaul Complete',
body_zh: '重新设计了首页 Hero、参数表单、投资组合卡片和统计表。字号阶梯扩大 2 倍，信息密度提升 40%。',
body_en: 'Redesigned homepage hero, parameter forms, portfolio cards, and stats table. Font hierarchy doubled, information density up 40%.',
variant: 'feature',
published_at: new Date().toISOString(),
},
{
slug: 'synthetic-tickers',
title_zh: '合成标的现已支持回测至 1962 年',
title_en: 'Synthetic Tickers Now Support Backtest Since 1962',
body_zh: '新增 20+ 合成标的（VTISIM、SPYSIM、BNDSIM 等），使用早期指数数据拼接现代 ETF，可将 60/40 组合回测拓展至 40 年以上。',
body_en: 'Added 20+ synthetic tickers (VTISIM, SPYSIM, BNDSIM, etc.) that splice early index data with modern ETFs, extending 60/40 backtests to 40+ years.',
cta_label_zh: '查看全部合成标的',
cta_label_en: 'View All Synthetics',
cta_link: '/data-engine#synthetic',
variant: 'feature',
published_at: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
},
{
slug: 'drawdown-fields-complete',
title_zh: '回撤片段字段全面补齐',
title_en: 'Drawdown Episode Fields Completed',
body_zh: '回撤片段现在显示：跌至谷底时间、恢复时间、恢复因子、期间 CAGR、期间 Ulcer 指数。所有字段均有可视化时间轴。',
body_en: 'Drawdown episodes now show: time to trough, recovery time, recovery factor, period CAGR, period Ulcer index. All with visual timeline.',
variant: 'feature',
published_at: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
},
{
slug: 'stats-table-17-cols',
title_zh: '统计表升级为 17 列横向表格',
title_en: 'Statistics Table Upgraded to 17-Column Layout',
body_zh: '从三卡片布局改为横向表格，支持列排序、列隐藏、多组合叠加对比。数据密度提升 4 倍。',
body_en: 'Changed from three-card layout to horizontal table with column sorting, hiding, and multi-portfolio stacking. 4x data density.',
variant: 'feature',
published_at: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
},
{
slug: 'chart-professionalization',
title_zh: '图表专业化：完整金额格式 + 纯年份 X 轴',
title_en: 'Chart Professionalization: Full Currency Format + Year-only X-axis',
body_zh: 'Y 轴显示 $350,000.00 而非 350k，X 轴显示 1988/1990/1992 而非 1988-01。图表工具栏支持时间范围快捷、对数坐标、下载。',
    body_en: 'Y-axis shows $350,000.00 instead of 350k. X-axis shows 1988/1990/1992 instead of 1988-01. Toolbar supports time range, log scale, download.',
variant: 'feature',
published_at: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
},
{
slug: 'floating-label-forms',
title_zh: 'Floating Label 表单上线',
title_en: 'Floating Label Forms Launched',
body_zh: '参数区改用 Floating Label 输入组件，垂直高度减半，视觉更专业。',
body_en: 'Parameter area now uses Floating Label inputs. Vertical space halved, more professional look.',
variant: 'info',
published_at: new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString(),
},
{
slug: 'portfolio-card-object',
title_zh: '投资组合升级为卡片对象',
title_en: 'Portfolio Cards as Objects',
body_zh: '组合从表单区块改为 320-460px 弹性卡片，支持横向 grid 布局。单屏可显示 8 个组合。',
body_en: 'Portfolios changed from form blocks to 320-460px flexible cards. Up to 8 portfolios visible per screen.',
variant: 'info',
published_at: new Date(Date.now() - 18 * 24 * 3600 * 1000).toISOString(),
},
{
slug: 'i18n-cleanup',
title_zh: 'i18n 双语键全面校验',
title_en: 'i18n Bilingual Keys Fully Verified',
body_zh: '新增自动化脚本 verify-i18n.mjs，确保中英文翻译文件完全同步，消除界面上的 key 泄露。',
body_en: 'New verify-i18n.mjs script ensures full sync between zh/en translations, eliminating key leaks in UI.',
variant: 'info',
published_at: new Date(Date.now() - 21 * 24 * 3600 * 1000).toISOString(),
},
{
slug: 'nav-3-groups',
title_zh: '导航栏精简为 3 分组',
title_en: 'Navbar Simplified to 3 Groups',
body_zh: '从 5 个分类下拉精简为 3 个（回测/分析优化/战术信号），加 3 个直达链接（数据引擎/文档/定价）。',
body_en: 'Reduced from 5 category dropdowns to 3 (Backtest / Analysis-Optimization / Tactical-Signal), plus 3 direct links.',
variant: 'info',
published_at: new Date(Date.now() - 25 * 24 * 3600 * 1000).toISOString(),
},
{
slug: 'data-engine-transparency',
title_zh: '数据引擎透明度页面',
title_en: 'Data Engine Transparency Page',
body_zh: '新增 /data-engine 页面展示所有标的、数据点数、覆盖率、更新时间。这是 testfol.io 都没有的差异化亮点。',
body_en: 'New /data-engine page shows all tickers, data points, coverage, update times. A differentiation testfol.io lacks.',
cta_label_zh: '前往查看',
cta_label_en: 'View Now',
cta_link: '/data-engine',
variant: 'feature',
published_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
},
];

for (const a of seed) {
await client.query(`     INSERT INTO announcements (slug, title_zh, title_en, body_zh, body_en, cta_label_zh, cta_label_en, cta_link, variant, published_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (slug) DO UPDATE SET
      title_zh = EXCLUDED.title_zh, title_en = EXCLUDED.title_en,
      body_zh = EXCLUDED.body_zh, body_en = EXCLUDED.body_en,
      cta_label_zh = EXCLUDED.cta_label_zh, cta_label_en = EXCLUDED.cta_label_en,
      cta_link = EXCLUDED.cta_link, variant = EXCLUDED.variant
  `, [
a.slug, a.title_zh, a.title_en, a.body_zh, a.body_en,
a.cta_label_zh ?? null, a.cta_label_en ?? null, a.cta_link ?? null,
a.variant, a.published_at,
]);
}

console.log(`Seeded ${seed.length} announcements`);
await client.end();
运行：node scripts/seed-announcements.mjs

步骤 3：后端 API
新建：packages/backend/src/routes/announcementRoutes.ts

TypeScript

import { Router } from 'express';
import { z } from 'zod';
import { db } from '@/db/pool';

export const announcementRoutes = Router();

announcementRoutes.get('/', async (req, res) => {
const limit = Math.min(parseInt(String(req.query.limit ?? '20')), 100);
const since = req.query.since ? String(req.query.since) : null;

let sql = `     SELECT id, slug, title_zh, title_en, body_zh, body_en,
           cta_label_zh, cta_label_en, cta_link, variant,
           published_at::text AS published_at
    FROM announcements
    WHERE 1=1
  `;
const params: any[] = [];

if (since) {
sql += ` AND published_at > $${params.length + 1}`;
params.push(since);
}

sql += ` ORDER BY published_at DESC LIMIT $${params.length + 1}`;
params.push(limit);

const result = await db.query(sql, params);
res.json({
data: result.rows.map(r => ({
id: r.id,
slug: r.slug,
title: { zh: r.title_zh, en: r.title_en },
body: { zh: r.body_zh, en: r.body_en },
ctaLabel: r.cta_label_zh ? { zh: r.cta_label_zh, en: r.cta_label_en } : null,
ctaLink: r.cta_link,
variant: r.variant,
publishedAt: r.published_at,
})),
});
});
在 app.ts 中挂载：app.use('/api/v1/announcements', announcementRoutes);

步骤 4：前端 store（未读状态管理）
新建：packages/frontend/src/store/announcementStore.ts

TypeScript

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Announcement {
id: number;
slug: string;
title: { zh: string; en: string };
body: { zh: string; en: string };
ctaLabel: { zh: string; en: string } | null;
ctaLink: string | null;
variant: 'info' | 'success' | 'warning' | 'feature';
publishedAt: string;
}

interface AnnouncementState {
announcements: Announcement[];
lastReadId: number;
loading: boolean;
fetch: () => Promise<void>;
markAllRead: () => void;
unreadCount: () => number;
}

export const useAnnouncementStore = create<AnnouncementState>()(
persist(
(set, get) => ({
announcements: [],
lastReadId: 0,
loading: false,

      fetch: async () => {
        set({ loading: true });
        try {
          const res = await fetch('/api/v1/announcements?limit=30');
          const json = await res.json();
          set({ announcements: json.data ?? [] });
        } finally {
          set({ loading: false });
        }
      },

      markAllRead: () => {
        const maxId = Math.max(...get().announcements.map(a => a.id), 0);
        set({ lastReadId: maxId });
      },

      unreadCount: () => {
        const { announcements, lastReadId } = get();
        return announcements.filter(a => a.id > lastReadId).length;
      },
    }),
    {
      name: 'announcement-store',
      partialize: (s) => ({ lastReadId: s.lastReadId }),   // 只持久化 lastReadId
    }

)
);
步骤 5：NotificationBell 组件
新建：packages/frontend/src/components/layout/NotificationBell.tsx

React

import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useAnnouncementStore } from '@/store/announcementStore';
import { cn } from '@/lib/utils';

export function NotificationBell() {
const { i18n, t } = useTranslation();
const { announcements, fetch, markAllRead, unreadCount } = useAnnouncementStore();
const [open, setOpen] = useState(false);
const lang = i18n.language.startsWith('zh') ? 'zh' : 'en';
const unread = unreadCount();

useEffect(() => {
fetch();
const interval = setInterval(fetch, 5 * 60 * 1000); // 每 5 分钟刷新
return () => clearInterval(interval);
}, [fetch]);

return (
<Sheet
open={open}
onOpenChange={(o) => {
setOpen(o);
if (o) markAllRead();
}} >
<SheetTrigger asChild>
<Button
variant="ghost"
size="icon"
className="h-8 w-8 relative"
data-testid="notification-bell"
aria-label={t('nav.notifications')} >
<Bell className="h-4 w-4" />
{unread > 0 && (
<span 
              className="absolute top-1 right-1 h-2 w-2 rounded-full bg-danger animate-pulse"
              data-testid="notification-unread-dot"
            />
)}
</Button>
</SheetTrigger>

      <SheetContent
        side="right"
        className="w-[420px] p-0"
        data-testid="notification-sheet"
      >
        <SheetHeader className="p-5 border-b border-border">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-h2">{t('announcements.title')}</SheetTitle>
            <span className="text-caption text-fg-tertiary">
              {t('announcements.subtitle', { count: announcements.length })}
            </span>
          </div>
        </SheetHeader>

        <div className="overflow-y-auto max-h-[calc(100dvh-5rem)]">
          {announcements.length === 0 ? (
            <div className="p-8 text-center text-fg-tertiary text-caption">
              {t('announcements.empty')}
            </div>
          ) : (
            announcements.map(a => (
              <article
                key={a.id}
                className="p-4 border-b border-border-subtle hover:bg-hover/30 transition-colors"
                data-testid={`announcement-item-${a.slug}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <VariantBadge variant={a.variant} />
                  <time className="text-caption text-fg-tertiary font-mono tabular-nums ml-auto">
                    {a.publishedAt.slice(0, 10)}
                  </time>
                </div>
                <h4 className="text-body font-semibold mb-1.5">
                  {a.title[lang]}
                </h4>
                <p className="text-caption text-fg-secondary leading-relaxed mb-2">
                  {a.body[lang]}
                </p>
                {a.ctaLabel && a.ctaLink && (
                  <Link
                    to={a.ctaLink}
                    className="text-caption text-brand hover:underline inline-flex items-center gap-1"
                    onClick={() => setOpen(false)}
                  >
                    {a.ctaLabel[lang]} →
                  </Link>
                )}
              </article>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>

);
}

function VariantBadge({ variant }: { variant: string }) {
const styles = {
feature: 'border-brand/40 bg-brand-subtle/8 text-brand',
info: 'border-fg-tertiary/40 bg-fg-tertiary/8 text-fg-tertiary',
success: 'border-success/40 bg-success-subtle/8 text-success',
warning: 'border-warning/40 bg-warning-subtle/8 text-warning',
} as const;
const labels = {
feature: '新功能',
info: '更新',
success: '完成',
warning: '提醒',
} as const;
return (
<span className={cn(
'inline-flex items-center px-1.5 py-0.5 text-micro font-semibold uppercase tracking-wider border rounded',
styles[variant as keyof typeof styles] ?? styles.info
)}>
{labels[variant as keyof typeof labels] ?? variant}
</span>
);
}
步骤 6：Navbar 集成
在 Navbar.tsx 中，之前 P1 的 <NotificationBell /> 占位替换为真正实现。

步骤 7：i18n
JSON

{
"nav": { "notifications": "通知" },
"announcements": {
"title": "产品动态",
"subtitle": "最近 {{count}} 条更新",
"empty": "暂无更新"
}
}
完成状态
API 返回数据

Bash

curl 'http://localhost:15001/api/v1/announcements?limit=20' | jq '.data | length'

# 期望：>= 10

铃铛显示未读点

打开主页（首次访问，lastReadId=0）
JS 断言：
JavaScript

const bell = document.querySelector('[data-testid="notification-bell"]');
const dot = document.querySelector('[data-testid="notification-unread-dot"]');
const results = {
hasBell: !!bell,
hasUnreadDot: !!dot,
};
// 期望：hasBell=true, hasUnreadDot=true
点击铃铛打开 Sheet 且显示公告列表

点击铃铛
等 500ms
JS 断言：
JavaScript

const sheet = document.querySelector('[data-testid="notification-sheet"]');
const items = document.querySelectorAll('[data-testid^="announcement-item-"]');
const results = {
sheetOpen: !!sheet && sheet.getBoundingClientRect().width > 0,
itemCount: items.length,
firstItemText: items[0]?.textContent?.slice(0, 100),
};
// 期望：sheetOpen=true, itemCount >= 10
关闭 Sheet 后红点消失

关闭 Sheet
刷新页面（模拟下次访问）
JS 断言：
JavaScript

const dot = document.querySelector('[data-testid="notification-unread-dot"]');
// 期望：dot === null
截图：

docs/audit/screenshots/p3-1-bell-with-dot.png（红点可见）
docs/audit/screenshots/p3-1-sheet-open.png（Sheet 展开列表）
docs/audit/screenshots/p3-1-bell-no-dot.png（关闭后无红点）
完成 Checklist
迁移 028 执行成功
种子脚本填充 10+ 条公告
后端 API /api/v1/announcements 返回数据
announcementStore 创建，lastReadId 持久化
NotificationBell 集成到 Navbar
未读时红点可见 + 动画
Sheet 抽屉展开显示列表
打开后 markAllRead 触发
i18n 中英双语
全部 JS 断言 PASS
3 张截图完成
P3-2：Results Action Bar Sticky（1 个子智能体）
背景
testfol.io 在回测完成后，结果区顶部有一条始终可见的操作栏，显示：

上下文信息（"14.99 年 · 2010-01-03 至 2024-12-30"）
5 个操作按钮：分享、保存回测、邮件提醒（Pro）、保存组合、导出
滚动到结果区时该栏 sticky 在顶部；滚回参数区时消失。

任务
步骤 1：新建 ResultsActionBar 组件
新建：packages/frontend/src/components/results/ResultsActionBar.tsx

React

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as LinkIcon, Bookmark, Bell, Save, Download, RefreshCw, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem
} from '@/components/ui/dropdown-menu';
import { PlanBadge } from '@/components/layout/PlanBadge';
import { cn } from '@/lib/utils';

interface Props {
timeRange: { start: string; end: string; years: number };
onRefresh?: () => void;
onShare?: () => void;
onSaveBacktest?: () => void;
onEmailAlerts?: () => void;
onSavePortfolio?: () => void;
onExport?: (format: 'csv' | 'json' | 'png' | 'pdf') => void;
}

export function ResultsActionBar(props: Props) {
const { t } = useTranslation();
const [sticky, setSticky] = useState(false);
const sentinelRef = useRef<HTMLDivElement>(null);

useEffect(() => {
if (!sentinelRef.current) return;
const obs = new IntersectionObserver(
([entry]) => setSticky(!entry.isIntersecting),
{ threshold: 0, rootMargin: '-1px 0px 0px 0px' }
);
obs.observe(sentinelRef.current);
return () => obs.disconnect();
}, []);

return (
<>
<div ref={sentinelRef} data-testid="results-action-bar-sentinel" className="h-0" />
<div
className={cn(
'transition-all duration-200 z-40',
sticky
? 'sticky top-0 h-14 bg-sticky-bg/95 backdrop-blur-md border-b border-border shadow-md'
: 'h-14 border-b border-border-subtle'
)}
data-testid="results-action-bar"
data-sticky={sticky} >
<div className="max-w-[1440px] mx-auto h-full px-6 flex items-center gap-4">
{/* 左侧：上下文 */}
<div className="flex items-center gap-3">
<h2 className="text-h3">{t('results.title')}</h2>
<span 
              className="text-caption text-fg-tertiary font-mono tabular-nums"
              data-testid="results-time-range"
            >
{props.timeRange.years.toFixed(2)} 年 · {props.timeRange.start} 至 {props.timeRange.end}
</span>
<Button variant="ghost" size="icon" className="h-6 w-6" aria-label={t('common.info')}>
<Info className="h-3.5 w-3.5 text-fg-tertiary" />
</Button>
</div>

          <div className="flex-1" />

          {/* 右侧：操作 */}
          <div className="flex items-center gap-1">
            {props.onRefresh && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={props.onRefresh}
                aria-label={t('common.refresh')}
                data-testid="action-refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}

            <div className="w-px h-5 bg-border mx-1" />

            <Button variant="ghost" size="sm" onClick={props.onShare} data-testid="action-share">
              <LinkIcon className="h-4 w-4 mr-1.5" /> {t('results.share')}
            </Button>
            <Button variant="ghost" size="sm" onClick={props.onSaveBacktest} data-testid="action-save-backtest">
              <Bookmark className="h-4 w-4 mr-1.5" /> {t('results.saveBacktest')}
            </Button>
            <Button variant="ghost" size="sm" onClick={props.onEmailAlerts} data-testid="action-email-alerts">
              <Bell className="h-4 w-4 mr-1.5" /> {t('results.emailAlerts')}
              <PlanBadge tier="pro" className="ml-1.5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={props.onSavePortfolio} data-testid="action-save-portfolio">
              <Save className="h-4 w-4 mr-1.5" /> {t('results.savePortfolio')}
            </Button>

            <div className="w-px h-5 bg-border mx-1" />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" data-testid="action-export">
                  <Download className="h-4 w-4 mr-1.5" />
                  {t('results.export')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => props.onExport?.('csv')} data-testid="export-csv">
                  CSV ({t('results.exportData')})
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => props.onExport?.('json')} data-testid="export-json">
                  JSON ({t('results.exportFull')})
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => props.onExport?.('png')} data-testid="export-png">
                  PNG ({t('results.exportChart')})
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => props.onExport?.('pdf')} data-testid="export-pdf">
                  PDF ({t('results.exportReport')})
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </>

);
}
步骤 2：集成到结果区
修改 packages/frontend/src/pages/backtest/BacktestResults.tsx（或类似）：

React

export function BacktestResults({ result }) {
const timeRange = {
start: result.startDate,
end: result.endDate,
years: (new Date(result.endDate).getTime() - new Date(result.startDate).getTime()) / (365.25 * 24 * 3600 * 1000),
};

return (
<div>
<ResultsActionBar
        timeRange={timeRange}
        onRefresh={handleRefresh}
        onShare={handleShare}
        onSaveBacktest={handleSaveBacktest}
        onEmailAlerts={handleEmailAlerts}
        onSavePortfolio={handleSavePortfolio}
        onExport={handleExport}
      />

      <ResultsTabs results={result} />
    </div>

);
}
步骤 3：i18n
JSON

{
"results": {
"title": "结果",
"share": "分享",
"saveBacktest": "保存回测",
"emailAlerts": "邮件提醒",
"savePortfolio": "保存组合",
"export": "导出",
"exportData": "数据",
"exportFull": "完整配置+结果",
"exportChart": "图表",
"exportReport": "报告"
},
"common": {
"info": "详情",
"refresh": "刷新"
}
}
完成状态
Action Bar 初始存在

打开主页 → 运行默认回测 → 等待完成
JS 断言：
JavaScript

const bar = document.querySelector('[data-testid="results-action-bar"]');
const results = {
hasBar: !!bar,
initialSticky: bar?.dataset.sticky === 'true',
timeRangeText: document.querySelector('[data-testid="results-time-range"]')?.textContent,
};
// 期望：hasBar=true, initialSticky=false (刚出现时不 sticky)
// timeRangeText 匹配 /\d+\.\d+ 年 · \d{4}-\d{2}-\d{2} 至 \d{4}-\d{2}-\d{2}/
滚动后变 sticky

滚动窗口 300px（window.scrollBy(0, 500)）
等 300ms
JS 断言：
JavaScript

const bar = document.querySelector('[data-testid="results-action-bar"]');
const rect = bar.getBoundingClientRect();
const results = {
stickyAttr: bar.dataset.sticky === 'true',
positionIsSticky: getComputedStyle(bar).position === 'sticky',
topIsZero: rect.top === 0,
};
// 期望：stickyAttr=true, positionIsSticky=true, topIsZero=true
5 个操作按钮全部存在

JavaScript

const buttons = ['share', 'save-backtest', 'email-alerts', 'save-portfolio', 'export'];
const results = buttons.map(b => ({
name: b,
exists: !!document.querySelector(`[data-testid="action-${b}"]`)
}));
// 期望：全部 exists=true
导出下拉菜单

点击"导出"按钮
等 200ms
JS 断言：
JavaScript

const items = ['csv', 'json', 'png', 'pdf'].map(f =>
!!document.querySelector(`[data-testid="export-${f}"]`)
);
// 期望：全部 true
截图：

docs/audit/screenshots/p3-2-action-bar-initial.png（初始状态）
docs/audit/screenshots/p3-2-action-bar-sticky.png（滚动后 sticky）
docs/audit/screenshots/p3-2-export-menu.png（导出下拉展开）
完成 Checklist
ResultsActionBar 组件创建，含 IntersectionObserver 逻辑
集成到 BacktestResults
5 个 action button + 4 项导出下拉
Pro 徽章标注邮件提醒
i18n 中英双语
JS 断言：初始非 sticky，滚动后 sticky
3 张截图完成
P3-3：回撤片段时间轴视觉打磨（1 个子智能体）
背景
P0-1-C 修复了数据字段和 NaN 问题。P3-3 是在数据正确基础上做视觉打磨：

从截图 5 观察到当前的问题：

每行有三个圆点（灰=峰值、红=谷底、绿=恢复），日期标签重叠（尤其是峰值和谷底相近的情况）
只显示了 10 段回撤，没有分页或"显示更多"
每行右侧的 "已恢复 · NaN年" 应该显示实际时间（已恢复 · 4.7 年）
缺少"筛选/排序"控件
展开详情后的内容排版待优化
任务
步骤 1：修复时间轴日期标签重叠
修改：DrawdownEpisodesV2.tsx 中的 TimelineViz 子组件

React

function TimelineViz({ episode }: { episode: DrawdownEpisode }) {
const peakDate = new Date(episode.peakDate);
const troughDate = new Date(episode.troughDate);
const recoveryDate = episode.recoveryDate ? new Date(episode.recoveryDate) : null;

const totalMs = recoveryDate
? recoveryDate.getTime() - peakDate.getTime()
: Date.now() - peakDate.getTime();
const troughPos = ((troughDate.getTime() - peakDate.getTime()) / totalMs) * 100;

// 判断标签是否会重叠（如果谷底和峰值距离 < 15%，隐藏谷底日期标签）
const troughLabelHidden = troughPos < 15;
// 如果谷底和恢复距离 < 15%，隐藏恢复日期标签
const recoveryLabelHidden = recoveryDate && (100 - troughPos) < 15;

return (
<div className="relative h-10" data-testid="drawdown-timeline">
{/* 基线 */}
<div className="absolute top-1/2 left-0 right-0 h-0.5 bg-border-subtle -translate-y-1/2" />

      {/* 灰色段（峰值到谷底） */}
      <div
        className="absolute top-1/2 left-0 h-0.5 bg-fg-tertiary/40 -translate-y-1/2"
        style={{ width: `${troughPos}%` }}
      />

      {/* 绿色段（谷底到恢复） */}
      {recoveryDate && (
        <div
          className="absolute top-1/2 h-0.5 bg-success/40 -translate-y-1/2"
          style={{ left: `${troughPos}%`, width: `${100 - troughPos}%` }}
        />
      )}

      {/* 峰值点 */}
      <div className="absolute left-0 top-1/2 -translate-y-1/2 flex flex-col items-start">
        <div className="w-2.5 h-2.5 rounded-full bg-fg-secondary border-2 border-surface -translate-y-1" />
        <div className="mt-1 text-micro text-fg-tertiary font-mono whitespace-nowrap">
          {episode.peakDate}
        </div>
      </div>

      {/* 谷底点 */}
      <div
        className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center -translate-x-1/2"
        style={{ left: `${troughPos}%` }}
      >
        <div className="w-3 h-3 rounded-full bg-danger border-2 border-surface -translate-y-1" />
        {!troughLabelHidden && (
          <div className="mt-1 text-micro text-danger font-mono whitespace-nowrap">
            {episode.troughDate}
          </div>
        )}
      </div>

      {/* 恢复点 */}
      {recoveryDate && (
        <div className="absolute right-0 top-1/2 -translate-y-1/2 flex flex-col items-end">
          <div className="w-2.5 h-2.5 rounded-full bg-success border-2 border-surface -translate-y-1" />
          {!recoveryLabelHidden && (
            <div className="mt-1 text-micro text-success font-mono whitespace-nowrap">
              {episode.recoveryDate}
            </div>
          )}
        </div>
      )}
    </div>

);
}
步骤 2：右侧持续时间显示修复
React

{/* 主行右侧 */}
<div className="text-caption text-fg-tertiary flex flex-col items-end">
  <span data-testid="episode-status">
    {episode.recoveryDate 
      ? t('drawdown.recovered')  // "已恢复"
      : t('drawdown.ongoing')     // "进行中"
    }
  </span>
  <span 
    className="font-mono tabular-nums" 
    data-testid="episode-duration"
  >
    {formatDuration(episode.totalDurationDays)}
  </span>
</div>
formatDuration 已在 P0-1-B 中实现，会正确返回 4.7年 而非 NaN年（因为 formatter 判空返回 "—"）。

步骤 3：分页 + 筛选 + 排序
修改主组件：

React

export function DrawdownEpisodesV2({ episodes, portfolioName }: Props) {
const [severity, setSeverity] = useState<'all' | 'severe' | 'moderate' | 'mild'>('all');
const [sortBy, setSortBy] = useState<'depth' | 'duration' | 'recent'>('depth');
const [displayLimit, setDisplayLimit] = useState(5);

const filtered = episodes
.filter(ep => {
if (severity === 'all') return true;
const abs = Math.abs(ep.depth) * 100;
if (severity === 'severe') return abs >= 20;
if (severity === 'moderate') return abs >= 10 && abs < 20;
if (severity === 'mild') return abs < 10;
return true;
})
.sort((a, b) => {
if (sortBy === 'depth') return a.depth - b.depth; // 从最深到最浅（因为 depth 是负数）
if (sortBy === 'duration') return b.totalDurationDays - a.totalDurationDays;
if (sortBy === 'recent') return new Date(b.peakDate).getTime() - new Date(a.peakDate).getTime();
return 0;
});

const displayed = filtered.slice(0, displayLimit);
const hasMore = filtered.length > displayLimit;

return (
<div 
      className="bg-surface border border-border rounded-xl"
      data-testid="drawdown-episodes-panel"
    >
{/* Header */}
<div className="flex items-center justify-between p-4 border-b border-border">
<div className="flex items-center gap-3">
<h3 className="text-h3">{t('drawdown.episodes')}</h3>
<span className="text-caption text-fg-tertiary" data-testid="episode-count">
{filtered.length} / {episodes.length}
</span>
</div>

        <div className="flex items-center gap-2">
          {/* 严重度过滤 */}
          <div className="flex items-center gap-0.5 bg-input-bg rounded-md p-0.5">
            {(['all', 'severe', 'moderate', 'mild'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSeverity(s)}
                className={cn(
                  'px-2.5 py-1 text-caption font-medium rounded transition-colors',
                  severity === s ? 'bg-surface text-fg' : 'text-fg-tertiary hover:text-fg'
                )}
                data-testid={`filter-severity-${s}`}
              >
                {t(`drawdown.severity.${s}`)}
              </button>
            ))}
          </div>

          {/* 排序下拉 */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="h-8 px-2 text-caption bg-input-bg border border-border rounded-md"
            data-testid="sort-selector"
          >
            <option value="depth">{t('drawdown.sortByDepth')}</option>
            <option value="duration">{t('drawdown.sortByDuration')}</option>
            <option value="recent">{t('drawdown.sortByRecent')}</option>
          </select>
        </div>
      </div>

      {/* 摘要 */}
      <div className="grid grid-cols-4 gap-6 px-6 py-4 border-b border-border-subtle">
        {/* KPI cells - 同之前 */}
      </div>

      {/* 列表 */}
      <div>
        {displayed.map((ep, i) => (
          <DrawdownEpisodeRow key={i} episode={ep} testId={`episode-row-${i}`} />
        ))}
      </div>

      {/* 展开更多 */}
      {hasMore && (
        <div className="p-4 border-t border-border-subtle text-center">
          <button
            onClick={() => setDisplayLimit(prev => prev + 10)}
            className="text-caption text-brand hover:underline"
            data-testid="show-more-episodes"
          >
            {t('drawdown.showMore', { count: Math.min(10, filtered.length - displayLimit) })}
          </button>
        </div>
      )}
    </div>

);
}
步骤 4：i18n
JSON

{
"drawdown": {
"episodes": "回撤片段",
"recovered": "已恢复",
"ongoing": "进行中",
"severity": {
"all": "全部",
"severe": "严重",
"moderate": "中度",
"mild": "轻微"
},
"sortByDepth": "按深度",
"sortByDuration": "按持续时间",
"sortByRecent": "按最近",
"showMore": "显示更多 {{count}} 段"
}
}
完成状态
无 NaN 出现（沿用 P0-1-C）

JavaScript

const panel = document.querySelector('[data-testid="drawdown-episodes-panel"]');
const nanCount = Array.from(panel?.querySelectorAll('*') ?? [])
.filter(el => el.children.length === 0 && /\bNaN\b/.test(el.textContent ?? ''))
.length;
// 期望：nanCount === 0
时间轴日期标签不重叠

抓取所有时间轴的日期标签，判断相邻标签是否重叠
JavaScript

const timelines = document.querySelectorAll('[data-testid="drawdown-timeline"]');
const overlaps = Array.from(timelines).map(tl => {
const labels = Array.from(tl.querySelectorAll('.text-micro'));
const rects = labels.map(l => l.getBoundingClientRect());
let hasOverlap = false;
for (let i = 0; i < rects.length - 1; i++) {
if (rects[i].right > rects[i + 1].left) hasOverlap = true;
}
return hasOverlap;
});
// 期望：overlaps.every(x => !x) === true
默认显示 5 段，可展开

JavaScript

const initial = document.querySelectorAll('[data-testid^="episode-row-"]').length;
// 期望：initial === 5

document.querySelector('[data-testid="show-more-episodes"]')?.click();
// wait 300ms
const after = document.querySelectorAll('[data-testid^="episode-row-"]').length;
// 期望：after === 15 或 === 全部
严重度过滤生效

JavaScript

document.querySelector('[data-testid="filter-severity-severe"]')?.click();
// wait 300ms
const rows = document.querySelectorAll('[data-testid^="episode-row-"]');
// 检查每行的 depth 显示是否 >= 20%
const allSevere = Array.from(rows).every(row => {
const depthText = row.querySelector('.text-danger.text-h3')?.textContent ?? '';
const depth = parseFloat(depthText.replace(/[%-]/g, ''));
return depth >= 20;
});
// 期望：allSevere === true
截图：

docs/audit/screenshots/p3-3-episodes-default.png（默认 5 段）
docs/audit/screenshots/p3-3-episodes-severe.png（筛选后仅严重段）
docs/audit/screenshots/p3-3-episodes-expanded.png（点击"显示更多"后）
docs/audit/screenshots/p3-3-episode-detail.png（展开某段详情）
完成 Checklist
TimelineViz 支持标签重叠检测（相邻 < 15% 时隐藏）
默认显示 5 段，点击"显示更多"每次 +10
严重度过滤（全部/严重/中度/轻微）
排序（深度/持续时间/最近）
无 NaN
i18n 中英双语
4 张截图完成
P3-4：多组合对比模式（1 个子智能体）
背景
回测的核心价值在于对比多个组合。当前主页添加多个组合后，需要验证：

统计表变成多行叠加
组合价值走势图有多条彩色线
回撤图有多条线
图例可点击 toggle 显示/隐藏
颜色和组合的对应关系全站一致
任务
步骤 1：确保 getPortfolioColor 全站一致
验证：packages/frontend/src/lib/chart-theme.ts 中的 getPortfolioColor(index) 必须在所有渲染组合的组件中被使用：

Portfolio Card 顶部彩色条
Portfolio Card 圆点
统计表首列圆点
组合价值走势图线条
回撤图线条
图例圆点
审计脚本：

Bash

grep -rn "chart-1\|chart-2\|chart-3\|portfolio._color\|getPortfolioColor" packages/frontend/src --include='_.tsx'
所有涉及组合颜色的地方必须调用 getPortfolioColor(index)，禁止硬编码。

步骤 2：图例交互（toggle 显示/隐藏）
修改 GrowthChartV2.tsx：

React

export function GrowthChartV2({ portfolios, currency = 'USD', benchmark }: Props) {
const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

const visiblePortfolios = portfolios.filter(p => !hiddenIds.has(p.id));

const toggleVisibility = (id: string) => {
setHiddenIds(prev => {
const next = new Set(prev);
if (next.has(id)) next.delete(id);
else next.add(id);
return next;
});
};

return (
<div data-testid="growth-chart">
{/* ... chart 略 ... */}

      {/* 图例 */}
      <div className="border-t border-border-subtle px-6 py-3 flex items-center justify-center gap-6 flex-wrap">
        {portfolios.map((p, i) => {
          const hidden = hiddenIds.has(p.id);
          const currentValue = p.growthCurve[p.growthCurve.length - 1]?.value;
          return (
            <button
              key={p.id}
              onClick={() => toggleVisibility(p.id)}
              className={cn(
                'flex items-center gap-2 transition-opacity',
                hidden ? 'opacity-30' : 'opacity-100'
              )}
              data-testid={`legend-${p.id}`}
              data-hidden={hidden}
            >
              <div
                className="w-3 h-0.5"
                style={{ background: getPortfolioColor(i) }}
              />
              <span className={cn(
                'text-caption text-fg',
                hidden && 'line-through'
              )}>
                {p.name}
              </span>
              {currentValue !== undefined && !hidden && (
                <span className="text-caption font-mono tabular-nums text-fg-tertiary">
                  {formatCurrency(currentValue, currency)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>

);
}
步骤 3：主页添加"对比示例"快捷入口
在 AddPortfolioMenu 中新增一项"加载示例对比"：

React

<DropdownMenuItem onClick={() => onAdd('example-comparison')}>
<GitCompare className="h-4 w-4 mr-2" /> 加载对比示例
</DropdownMenuItem>
对应处理器加载 3 个对比组合：

60/40 股债 (VTI 60 / BND 40)
100/0 全股 (VTI 100)
40/60 债股 (VTI 40 / BND 60)
完成状态
加载对比示例

打开主页，点击"添加组合" → "加载对比示例"
等待自动运行回测
JS 断言：
JavaScript

const cards = document.querySelectorAll('[data-testid="portfolio-card"]');
const rows = document.querySelectorAll('[data-testid="statistics-table"] tbody tr');
const lines = document.querySelectorAll('[data-testid="growth-chart"] .recharts-line');
const results = {
cardCount: cards.length,
statRowCount: rows.length,
chartLineCount: lines.length,
};
// 期望：cardCount === 3, statRowCount === 3, chartLineCount === 3
颜色一致性

JavaScript

// 取第一个组合卡片的顶部彩色条颜色
const firstCard = document.querySelectorAll('[data-testid="portfolio-card"]')[0];
const cardStripeColor = getComputedStyle(firstCard).borderTopColor;

// 取统计表第一行的圆点颜色
const firstDot = document.querySelector('[data-testid="statistics-table"] tbody tr:first-child [data-testid="portfolio-color-dot"]');
const dotColor = getComputedStyle(firstDot).backgroundColor;

// 取图例第一项颜色
const firstLegend = document.querySelector('[data-testid^="legend-"]');
const legendColor = getComputedStyle(firstLegend.querySelector('div')).backgroundColor;

// 三者应完全一致
const results = {
cardStripeColor,
dotColor,
legendColor,
allEqual: cardStripeColor === dotColor && dotColor === legendColor,
};
图例点击 toggle

点击第一个图例
JS 断言：
JavaScript

const legend = document.querySelector('[data-testid^="legend-"]');
const idBefore = legend?.dataset.hidden;
legend?.click();
// wait 200ms
const idAfter = legend?.dataset.hidden;
const lineCount = document.querySelectorAll('[data-testid="growth-chart"] .recharts-line').length;
// 期望：idBefore='false', idAfter='true', lineCount 减少 1
截图：

docs/audit/screenshots/p3-4-comparison-cards.png（3 张组合卡片横排）
docs/audit/screenshots/p3-4-stats-table-3-rows.png（统计表 3 行）
docs/audit/screenshots/p3-4-growth-chart-3-lines.png（图表 3 条线）
docs/audit/screenshots/p3-4-legend-toggle.png（隐藏一个组合后）
完成 Checklist
getPortfolioColor 全站使用（无硬编码颜色）
图例可点击 toggle 显示/隐藏
主页"添加组合"下拉含"对比示例"
颜色一致性验证（卡片/表格/图表/图例四处颜色相同）
4 张截图完成
P3 阶段总验收
在所有 P3 子任务完成后：

Bash

npm run audit:all > docs/audit/reports/p3-final.json
验收标准：

铃铛红点 + Sheet 抽屉 + 10+ 公告
Sticky Action Bar，滚动后固定
回撤片段无 NaN，日期标签不重叠，可筛选可排序
多组合对比：3 卡片 → 3 表格行 → 3 图表线 → 颜色一致
npm run audit:all PASS
git tag v3.0-p3-complete → v3.0-final
我给你的补充提醒
P3 的 4 个任务完全独立，可以完全并行派发
P3-1 的种子公告脚本是我建议你用来"制造产品活力"的技巧——即使这些更新是真实的（P0/P1/P2 都做了），列出来给用户看也能显著提升平台的"活性感"
P3-2 的 sticky 逻辑依赖 IntersectionObserver，在某些浏览器可能有细微行为差异，如果验证时 sticky 不生效，检查 rootMargin 参数
P3-3 时间轴重叠检测用了 getBoundingClientRect，需要 DOM 已渲染，验证脚本记得 await page.waitForTimeout(500)
P3-4 颜色一致性是最容易被忽略的细节。人眼一看就知道"这个组合在图表和表格里是不同颜色"是很不专业的
