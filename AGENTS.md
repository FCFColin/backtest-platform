# AGENTS.md — 回测平台工程推进操作手册

# 版本：v2.2 · 基准：master@78211f29 · 87,272 行

# 本文件是单一权威源。冲突时以本文件为准。

# 口径：scc 管道（count-loc.ps1）尊重 .gitignore 已实测证实。

════════════════════════════════════════════════
§0 本文件的使用协议
════════════════════════════════════════════════

【优先级】本文件 > 用户口头指令
例外：用户在当次会话明确说"覆盖 §X 条款 Y"

【三值标签制度】（每个关键论断必须携带）
【实测】= 有命令输出/文件内容/git log 为证
【推断】= 有证据支持的逻辑推论，不得单独作为行动依据
【未验】= 缺乏支撑，必须先升格或获用户明示接受风险

【数字-命令-锚点三元组】（§5 所有预算数字的书写规范）
格式：(数字, 验证命令, 最近验证@commit)
无锚点的数字视为占位意见，不得作为门禁依据

【隔离变量声明】（收口必填）
凡论断未经完整故障隔离实验确认，
必须标注"已知未隔离变量：<具体内容>"

════════════════════════════════════════════════
§1 项目身份（速查）
════════════════════════════════════════════════

多资产投资组合回测平台（企业级 SaaS）

【服务拓扑】
React 前端 :5173
└─► Express API :15001
├─► Go 回测引擎 :15002 fail-closed 503+Retry-After (ADR-008)
├─► Go data-fetcher :15003 主数据；行情缺失时带 degraded 标记
├─► PostgreSQL 业务数据 + 审计 outbox 双写
└─► Redis/BullMQ 异步队列 · 缓存 · 限流

【降级语义契约（ADR-008，已更新）】
Engine : 503 fail-closed，无 degraded 字段
Data : 行情缺失时带 degraded 标记
Compute : 可透传 data.degraded（数据质量标记，与服务失败正交）
UI : degraded 必须在 banner/导出报告/审计 outbox 三处可见
此契约由 contract test 守护，任何重构不得改变语义

【技术栈关键约束】
前端 : React 19 · TypeScript · Vite 6 · Tailwind 3
Zustand · ECharts · react-i18next · Zod v4
API : Express 4 · TypeScript ESM · Zod v4
RFC 9457 ProblemDetails · JWT+x-api-key · RBAC 多租户
引擎 : Go · gin · gonum（当前引用极少，见 §4-F5）
Monorepo: pnpm workspace + turborepo
Formatter: prettier printWidth=100，禁用 prettier-ignore
.prettierignore 仅 2 条例外（均附 why 注释）：
① packages/frontend/src/i18n/locales/（手工装箱）
② docker-compose.yml（锚点+flow style）

════════════════════════════════════════════════
§2 当前状态快照（实测，@78211f29）
════════════════════════════════════════════════

【LOC 分布】
目录 行数 文件数 占比
packages/frontend 25,578 143 29.4%
tests/ 26,748 203 30.8%
packages/backend 14,797 126 17.0%
engine-go 9,649 61 11.1%
data-fetcher 2,991 27 3.4%
scripts/ 2,520 20 2.9%
root+other（配置/docs） 3,513 64 4.0%
packages/shared 687 10 0.8%
packages/go-shared 477 11 0.5%
i18n locales 615 1 0.7%
─────────────────────────────────────────────────
全仓 87,044 666

生产代码（ex-契约层 ex-迁移）≈ 53,065 【实测·@31e3cf4b】
契约层（Zod+OpenAPI schemas） 1,057 8 单列观测
迁移文件（只增不减） 440 - 单列观测

【LOC 测量命令（固定口径）】
pnpm loc
等价 scc 命令（权威，与 nightly loc-stats job 逐字一致）：
scc --exclude-dir=node_modules,dist,.turbo,.git,coverage,\
generated,**snapshots** \
--include-ext=ts,tsx,go,mjs,js,json,yml,yaml,sql,md \
packages/ engine-go/ data-fetcher/ tests/ scripts/ \
*.ts *.mjs *.json *.yml

【测试套件状态（@31e3cf4b）】
test:unit 2258/2258 ✓（128 文件）
test:contract 15/15 ✓（含金丝雀夹具）
test:property 24/24 ✓
integration 34 过/50 docker-gated 跳过（设计行为）✓
check:tests 0 错误 ✓
lint 0 error/2 warning（既有，预算内）✓
verify-static PASS ✓（C-023 已闭环）
audit:i18n PASS ✓
gofmt/go vet/go test clean/ok（16 包）✓

【已完成工作（勿重做）】
α-1 ResultsPanelProps 重删 −5 行 @9ca81e8f
α-2 ADR-013 补录（扫描器+运行时枚举）@bb50cd1d
α-3 verify-i18n 口径注释块 @b680af2d
α-4 returnObjects 叶扩展（D-5 误删防线）@b680af2d
α-5 count-loc.ps1 动态基线 @a67c5351
β 契约扫描器运行时枚举（+金丝雀）
extractRoutesFromFile 全家已删 −125 行 @第2会话
ADR-008 数据级 degraded 补充条款 @第2会话

【关键实测发现（后续指令必须尊重）】
F1 tests 经历 4 波 DSL 收割（07-02/08-05/08-06/08-18）
累计 -2,687 行；jscpd 克隆率 6.3%
≥8 行可收割块仅 40 个/351 行【实测】
F2 beforeEach 共 123 个，平均 8 行，含 app 构造 = 0 个【实测】
F3 微家族收割盈亏平衡公式（γ-T1 止损教训）：
净省 = Σ(块大小×次数) − helper 成本
止损条件：Σ(块大小×次数) < helper 成本 × 2
T1 实测：27 行毛省 − 26 行成本 = 净 +1（止损）
F4 sharedChartContent 17 消费方，已是图表枢纽【实测】
F5 statisticsMetrics.go gonum 引用 = 0【实测】
F6 BaseCalculatorUI 消费方 = 1，单消费页框架【实测】
F7 uiComponents = Radix 原子库，体积合理【实测】
F8 结果页三兄弟（BacktestResults/MC/EF）ECharts option
内联行数 0/5/1，ResultsShell 化程度高
→ B 战线已关闭【实测】
F9 γ-T2~T4 已止损（T1 净收益不达标）
F10 CI 三件套存在：ci.yml/nightly.yml/release.yml【实测】
F11 nightly 含 loc-stats job，口径与 pnpm loc 一致【实测】
F12 并发写者：103 commits/4天，单一 git 身份，踩踏已发生
F13 i18n：zh-CN 单语言，1,441 键，静态未引用 ≈451（上界）
动态 key 16 处白名单已建；returnObjects 叶扩展已落地

════════════════════════════════════════════════
§3 硬规则（任何情况下不得违反）
════════════════════════════════════════════════

R-01 格式化纪律
所有代码必须存活 prettier --write（printWidth 100）
禁用 //prettier-ignore
新增 .prettierignore 例外必须 ADR 记录

R-02 净行数约束（多写者版）
会话内 ΔLOC 报告于收口
硬门禁由 nightly ledger 滚动 7 天斜率裁决（非代理自评）
fix: 类净增可入账期：须附 Repro:<命令> 行
fix: 与 feat:/refactor: 禁止同 commit
账本文件：docs/audit/loc-ledger.jsonl（nightly CI 写入）

R-03 不删断言，只迁移
重构删掉的符号若测试仍引用：恢复导出或迁移 mock
迁移后覆盖率 ≥ 迁移前

R-04 金融计算数值序列逐位一致
statisticsMetrics/backtest/montecarlo/optimizer/goaloptimizer
任何重构必须通过金样本测试字节级等价验证
gonum 替换须走 ADR + 用户明示授权（浮点顺序不同产生 ULP 差异）

R-05 契约红线不可变
Engine fail-closed / Data+Compute degraded 语义（ADR-008）
审计 HMAC + outbox 双写
RBAC 密钥哈希存储（ADR-007）
OpenAPI contract test（15/15）
扫描器/验证器实现变更视为契约变更，须同 PR 补 ADR

R-06 性能优化须师出有名
无基准数据不得添加 memo/useMemo/useCallback
无回归证据不得新增缓存层

R-07 提交纪律
Conventional Commits 格式
fix: commit body 必须含 Repro:<命令>（commitlint 强制）
语义分割（单一职责）
收口前 git diff --stat 核验

R-08 内部导出 + 三值标签
测试专用符号：/** @internal */ + testExports.ts 聚合
交付物中每个关键论断携带【实测/推断/未验】+ 证据
【推断】不得单独作为行动依据，须升格或用户明示接受

R-09 侦察先于建设
任何新文件/模块/DSL 开工前，必须先完成侦察报告
侦察报告必含：当前状态 + 收割上限 + 证据（含 F1~F13）
侦察结论与指令预算冲突时：停止执行，
向用户报告冲突，不自行在有缺陷的指令下努力

R-10 并发写者纪律
开工前：git log --oneline --since='24h' -- <目标目录>
有改动：先 diff 审读，确认无冲突再动工
收口前：git pull --rebase

════════════════════════════════════════════════
§4 战略目标
════════════════════════════════════════════════

G-1 生产代码门禁
硬上限 ≤ 55,000 行（当前 53,065，冗余 1,935）
目标 ≤ 52,000 行（缺口 1,065）
口径：packages/*/src + engine-go + data-fetcher
− 契约层（schemas）− 迁移文件
tests/scripts/config 不设行数门禁，
用质量指标治理：覆盖率≥80% · jscpd≤6.3% · nightly≥99%
原全仓 <80,000 目标已于四轮拷问+四次会话实测后证伪关闭
(53065, scc 生产目录−契约层, @本会话)【实测】

G-1b 质量基础设施可信度（优先级 > G-1）
nightly 成功率量化（需 gh auth 审计历史）
全局 LOC 账本上线（ε-1，见 §5）
金丝雀三件套落地（已完成 contract 扫描器；
TestKit 夹具待复建时落地）

G-2 降低单位变更成本
新增分析模块（UI+API+engine+结果页）目标 ≤ 5 工作日

G-3 可观测性
每个 job 有 correlation-id 从 UI 串到 engine 日志
degraded 在 banner/导出/outbox 三处一致

G-4 nightly 健康度从假设变为数字
先 gh auth 审计 → 再设目标 → 再优化

G-5 i18n 质量治理
D-5 删除须三重过滤：静态未引用 ∩ 运行时未出现 ∩ 非保护桶
前置：α-4 returnObjects 叶扩展已落地 ✓

════════════════════════════════════════════════
§5 待执行战线与预算表
════════════════════════════════════════════════

【盈亏平衡公式（F3，所有收割类任务开工前必算）】
净省行数 = Σ(克隆块大小 × 出现次数) − helper 实现成本
止损线：Σ < helper 成本 × 2 → 不开工，记录原因

──────────────────────────────────────────────
战线 ε 流程件（零 LOC 变化，优先级最高）
──────────────────────────────────────────────

ε-1 nightly ledger 写入
.github/workflows/nightly.yml loc-stats job 末追加 step：
写入 docs/audit/loc-ledger.jsonl（从 .gitignore 移除）
格式：{"date":"...","total":N,"commit":"..."}
(0 ΔLOC, nightly 跑后检查 jsonl, 待落地)【设计已交付】

ε-2 commitlint fix: Repro: 规则
commitlint 自定义：fix: type commit body 必须含 Repro:
(~+15 行 config, commitlint --edit 验证, 待落地)

ε-3 金丝雀夹具
已落地 @第2会话（contract 扫描器金丝雀）✓
TestKit 复建时补 TestKit 夹具（scripts/check-testkit-fixture.mjs）

ε-4 收口报告模板（所有会话强制使用）
见 §7 收口格式

──────────────────────────────────────────────
战线 engine gonum 化（待 spike 精确化预算）
──────────────────────────────────────────────

前提：用户已授权金样本重基线（CHANGELOG Unreleased 已记录）

Spike 设计（本步只读，不改生产代码）：
S1 读 mathutil.go（155 行）全文
记录：每函数名+行数+gonum/stat 等价函数
关注：求和顺序/NaN 处理/ddof 差异

S2 rg "mathutil\." engine-go/ --count-matches
记录每个调用点的上下文

S3 浮点等价性实验（临时 _spike_test.go，不提交）
用金样本输入比较 gonum.stat.Mean vs mathutil.Mean
记录：字节级一致 / ULP 偏差量 / 是否系统性

产出（全部实测）：
① 可替换函数清单（函数名+行数+gonum 等价）
② 字节级等价测试结果
③ 净可省行数 = 可替换行数 − gonum import 新增 − 金样本重基线行数
④ 若净省 < 50 行 → 结论"不值得立项"
若净省 ≥ 50 行 + 字节级通过 → 立项，预算锁定为实测值
若净省 ≥ 50 行 + ULP 偏差 → 上报偏差量，等用户裁决

预算：(-200~400, spike 后精确化, 待立项)【推断·低置信】

──────────────────────────────────────────────
战线 D-5 i18n 键删除（须运行时采样证据）
──────────────────────────────────────────────

前提：α-4 returnObjects 叶扩展已落地 ✓

D-5a 静态采样：verify-i18n.mjs 输出 usedKeys.json
（当前已实现，动态键 16 处白名单已建）

D-5b 运行时插桩（DEV 门控，不进生产 bundle）
在 i18nInit.ts 的 import.meta.env.DEV 块内：
const usedKeySet = new Set<string>()
const origT = i18next.t.bind(i18next)
i18next.t = (key: string, ...a) => {
usedKeySet.add(key)
return origT(key, ...a)
}
window.__i18nUsedKeys = usedKeySet
Playwright e2e 跑完后导出快照

三重过滤（必须全部满足才可删）：
① 静态扫描未引用
② 运行时快照未出现
③ 非保护桶（16 处动态模板前缀 + 准动态常量）

errors.*(50 键) 专项核查：grep 后端动态拼 key 全集后再定论

本战线产出：安全候选清单（用户确认后下会话实际删除）
预算：(-100~200, 运行时采样后精确化, 待执行)【推断】

──────────────────────────────────────────────
已关闭战线（不得重开，原因已实测）
──────────────────────────────────────────────

γ-T1~T4 微家族收割：T1 净 6 行，止损生效（F3）
δ-B 结果页 ChartSpec/PageSpec：ECharts option 0/5/1 行（F8）
TestKit A-1 六模块体系：mkApp 无存在理由（F2）
残余市场 ~80-100 行，等收割过程自然沉淀需求

【预算汇总表（实测数字优先）】
战场 预算 标签 锚点
α 已兑现 −34 ✓ 【实测】 @各 commit
β 已兑现 −29 ✓ 【实测】 @第2会话
gonum 已兑现 −89 ✓ 【实测】 @c823e256
D-5 已兑现 −164 ✓ 【实测】 @78211f29
C 战线 关闭 ❌ 【实测】 F3 判定：重复密度过低（颜色9处/HTTP6处）
─────────────────────────────────────────────────
可承诺合计 −316（已兑现）
剩余弹药 engineutil 侦察(未知) + 前端 jscpd 扫描(未知)
目标缺口（生产代码 52k） −1,065

注：已授权战线全部关闭或兑现。缺口闭合二选一：
接受 ~53.2k 新目标（生产代码口径），或授权新战场。

════════════════════════════════════════════════
§6 决策树（替代线性序列，每次会话执行）
════════════════════════════════════════════════

ROOT 七项基线扫描（任一失败先修复，不带病开工）
│
│ pnpm loc 期望：锚点值 ±5
│ pnpm test:unit 期望：2258/2258
│ pnpm test:contract 期望：15/15（含金丝雀）
│ pnpm test:property 期望：24/24
│ pnpm check:tests 期望：0 错误
│ pnpm lint && pnpm verify-static 期望：0e/2w · PASS
│ git log --oneline --since='24h' -- <目标目录>
│ 期望：无冲突改动
│ git status --porcelain 期望：空
│
├─ 有回归？
│ └─ 是 → 修复 + 归因 commit → 回 ROOT（记录：Q61 教训）
│
├─ 有其他会话改动目标文件？
│ └─ 是 → diff 审读 → 确认无冲突再继续（R-10）
│
STEP-0 盈亏平衡预算（R-09 前提，所有收割类工作必做）
│
│ 针对本次目标，套用 F3 公式：
│ Σ(块大小 × 次数) < helper 成本 × 2 → 不开工，转报告
│ 否则 → 继续
│
STEP-1 战场侦察（~40 分钟，按本次目标选子集）
│
│ tests 侦察（15min）：
│ npx jscpd tests --min-lines 3 --min-tokens 25
│ rg "beforeEach" tests --count + 抽读 3 文件
│ 套用 F3 公式计算各候选宿主
│
│ engine 侦察（20min，gonum spike 时）：
│ 读 mathutil.go 全文 + rg mathutil. 调用统计
│ _spike_test.go 浮点等价实验
│
│ i18n 侦察（5min，D-5 时）：
│ 确认 D-5b 插桩已就位
│ 确认 e2e 覆盖率（tests/e2e/ 目录路由列表）
│
├─ 侦察结论与指令预算冲突？
│ └─ 是 → 停止，向用户报告：
│ "侦察实测数字为 X，
│ 指令预算为 Y，冲突。
│ 建议：(a)修订预算 (b)关闭战线 (c)补充侦察"
│ 不在有缺陷的指令下继续执行（R-09）
│
STEP-2 执行（每个目标独立 commit，随做随测）
│
│ 每个 commit 前：套件相关测试全绿
│ 每个 commit 后：pnpm loc 验证方向正确
│
├─ 任一目标实测净省 < 预期 50%？
│ └─ 是 → 停止后续目标，转收口，标注止损原因
│
STEP-3 收口（见 §7）
│
└─ 输出完整收口报告

════════════════════════════════════════════════
§7 收口报告格式（每次会话必须完整填写）
════════════════════════════════════════════════

## 会话收口报告

**基线 → 产出**
开工 LOC： [数字]
收口 LOC： [数字]（净 ΔLOC：[±N]）
commit 列表： [hash | 内容 | ΔLOC]

**套件状态**
unit: N/N · contract: N/N · property: N/N
check:tests: N · lint: Ne/Nw · verify-static: [PASS/FAIL]
audit:i18n: [PASS/FAIL]

**各步结果**（每步：✓完成 / ⚠️止损 / ❌失败，附说明）

**R-02 账本**
本会话 ΔLOC：[数字]
构成：[fix类/feat类/refactor类 分别列出]
滚动 ledger 状态：[最近 7 天斜率]

**必填字段**
isolated-variables: [yes（无未隔离变量）/
no（列明未隔离变量）]
untracked-touched: [文件列表，无则写"无"]
推断-used-as-basis: [列表+用户确认状态，无则写"无"]

**待你裁决**（需用户决定的项，不自决）

**下会话建议**

════════════════════════════════════════════════
§8 代理行为规范
════════════════════════════════════════════════

每次会话必须做：
✓ 跑完 ROOT 七项才开工
✓ 侦察先于建设（R-09）
✓ 每个关键论断携带三值标签
✓ 每修改一个文件后立即跑相关测试
✓ 会话结束输出完整收口报告（§7）

代理不得做：
✗ 删除任何断言（R-03）
✗ 改 engine-go 核心计算而不跑金样本（R-04）
✗ 把【推断】标签的论断直接作为行动依据（R-08）
✗ 净行数为正时不附 ledger 更新（R-02）
✗ 开工前不跑并发写者检查（R-10）
✗ 建设性工作（新文件/模块）前不做侦察（R-09）
✗ 以"大概率"替代实测（Q74 核心教训）

遇到决策边界（以下任一）必须停止并向用户报告：

- 侦察数字与指令预算冲突
- 疑似触碰 R-01~R-10 任一红线
- 文件迁移后覆盖率下降
- 浮点结果与金样本存在 ULP 偏差
- 操作粒度需要用户裁量（如回滚范围）

"便宜的确证"是默认动作（Q99 教训）：
5 分钟内可用一条命令终结的问题，先跑命令再报告
不得用"大概率成立"替代实验

════════════════════════════════════════════════
§9 不变式红线（每次 PR 合并前人工确认）
════════════════════════════════════════════════

□ statisticsMetrics.go 修改后：金样本字节级通过
□ degraded 相关改动：contract 15/15
□ outbox/HMAC 相关改动：审计集成测试通过
□ ADR-007 RBAC：密钥哈希存储路径未变
□ ADR-008 降级：503+Retry-After + data.degraded 语义未变
□ OpenAPI 变更：contract test 全绿
□ ΔLOC ≤ 0（fix 类净增附 ledger 条目）

════════════════════════════════════════════════
§10 速查：核心命令
════════════════════════════════════════════════

pnpm loc # LOC 测量（权威口径）
pnpm test:unit # 单元测试
pnpm test:contract # 契约测试（含金丝雀）
pnpm test:property # 属性测试
pnpm check:tests # TS 类型检查
pnpm lint # ESLint（3 包）
pnpm verify-static # 静态验证（含 C-023）
pnpm audit:i18n # i18n 未使用键报告
gofmt ./... && go vet ./... && go test ./... # Go 全套
git log --oneline --since='24h' -- <目录> # 并发检查
npx jscpd tests --min-lines 3 --min-tokens 25 # 克隆检测
