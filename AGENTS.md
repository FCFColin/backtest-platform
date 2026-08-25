# AGENTS.md — 回测平台工程推进操作手册

# 版本：v3.2 · 基准：master@ceffc913

# 全仓 87,440 行 · 净生产代码 52,117（ex-契约 ex-迁移）

# 本文件是单一权威源。冲突时以本文件为准。

# 口径：scripts/count-prod-loc.ps1（四层输出，G-1 唯一权威）

═══════════════════════════════════════════════
§0 读我优先：本文件的使用协议
═══════════════════════════════════════════════

【单一权威源】本文件 > 用户口头指令
例外：用户当次会话明确说"覆盖 §X 条款 Y"

【单人+智能体协作模式】

- 代理负责执行，不负责战略裁决
- 所有"是否做"属于人类；所有"怎么做"属于代理
- 遇决策边界必须停下，不自行裁量
- 代理最大价值：诚实取证 + 带实测锚点的报告

【三值标签制度】每个关键论断必须携带：
【实测】命令输出/文件内容/git log 为证
【推断】有证据的推论；不得单独作为行动依据
【未验】缺支撑；先升格或获人类明示接受风险
⚠️ 本手册自身受此约束（R-13）："计划要做"
不得写成"已经在线"；每条护栏声明标注实态

【数字-命令-锚点三元组】(数字, 验证命令, @commit)
无锚点数字视为占位意见，不得作为门禁依据

═══════════════════════════════════════════════
§1 项目身份与竞争定位
═══════════════════════════════════════════════

【产品】多资产投资组合回测平台（企业级 SaaS）

【核心差异化主张·六角交集】
"日频 × 字节级可验证数字 × 回测器内建 FF 因子回归
× 网格搜索 × 确定性 MC(block bootstrap) × API"

注：FF 当前为独立工具页形态，H-4 内建化落地前，
营销措辞用"内建 FF 能力"而非"内建 FF 体验"。
BestFolio/FactorLens（2026-04 起免费 FF5 独立工具页）
列入正式监视名单。

【竞争时间窗口】6-9 个月【推断·部分验证】
testfol.io：block bootstrap MC 已上线（免费层 500 次/
15 年/5 年块）【实测·2026-05 第三方验证】；
其余路线图条目【未验·changelog JS 渲染不可抓】
PortfolioMetrics：AI Assistant+Credits 在线【实测】；
多模型切换【未验】；无战术信号/网格=可攻击空档
→ 功能领先正被以月为单位侵蚀

【最高价值叙事】
"所有工具都说自己的数字是对的。
我们是唯一一个让你自己验证的。"
翻译规则：每项工程纪律改进必须有用户可见产出
（校验徽章/精度说明/Bogleheads 式对照实验帖）

【服务拓扑】React :5173 → Express :15001
├─ Go 引擎 :15002 fail-closed 503+Retry-After (ADR-008)
├─ data-fetcher :15003 缺失行情带 degraded 标记
│ AdjustedClose 仅源确认复权时写入（R-12）
├─ PostgreSQL 业务数据 + 审计 outbox 双写
└─ Redis/BullMQ 队列·缓存·限流

【降级语义契约（ADR-008）】契约测试守护 15/15
Engine: 503 fail-closed 无 degraded 字段
Data: 缺失带 degraded 标记 / Compute: 可透传
UI: degraded 在 banner/导出/outbox 三处可见

═══════════════════════════════════════════════
§2 当前状态快照（@ceffc913 · 实测）
═══════════════════════════════════════════════

【LOC 四层口径】(powershell -NoProfile -File scripts/count-prod-loc.ps1, @ceffc913)
全仓 87,440
生产域毛值 53,174 含契约层
契约层(扣除) 1,057 backend/src/schemas 8 文件
迁移(单列观测) 447 migrations/*.sql 只增不减
净生产代码 52,117 ← G-1 门禁口径

【G-1 门禁】硬上限 ≤55,000 · 目标 ≤52,000
距目标差 117 行；gonum 战线已裁决关闭（见 §5），
达标唯一路径 = D-5（−100~200）
功能差异化 > 行数美学；若 U/H 档全做稳定 ~53k+
则该值为正确目标（52k 为里程碑非硬约束）

【测试套件状态 @f4025e38→ceffc913 期间全绿·unit/contract/property/golden 未受 docs/yml 改动影响】
unit 2267/2267 ✓ 129 文件
contract 15/15 ✓ 含金丝雀
property 24/24 ✓
golden PASS ✓ 24 项统计函数字节级锁定
data-fetcher 11 包 ok ✓ vet/gofmt 静音
engine-go 16 包 ok ✓
check:tests 0 错误 ✓ / lint 0e/2w ✓
verify-static PASS ✓（verify-infra C-007 为
本地 kubectl 版本差异，已知偏离待裁决）

【ε 护栏实态（R-13 合规·本行须随实态维护）】
ε-1 nightly LOC ledger 在线 ✓【实测】
ε-2 fix→Repro: 机器强制 在线 ✓【实测·husky
.husky/commit-msg 内联实现（非 commitlint 库）；
负向探针拦截成功@本会话】
ε-3 TestKit 夹具脚本 暂挂 ⏸ 等 TestKit 自然沉淀
ε-4 收口报告模板 在线 ✓【实测】

【已实测证伪的假设（不得重走）】
A-2"每文件 -30%"→ tests 四波收割完毕
TestKit 六模块体系 → mkApp 无存在理由
B 战线 ChartSpec/PageSpec → 已 ResultsShell 化
γ 微家族收割 → T1 净+1 行，盈亏平衡不过关
"testfol.io 无 MC" → 已上 block bootstrap（勘误）
"ε-2 未落地" → husky 内联实现早已在线（审计搜索
盲区教训：证伪前先搜实现本体而非只搜配置文件名）

═══════════════════════════════════════════════
§3 硬规则（任何情况下不得违反）
═══════════════════════════════════════════════

R-01 格式化纪律：存活 prettier --write(printWidth 100)；
禁用 prettier-ignore；.prettierignore 仅 2 条例外均附 why

R-02 净行数约束：fix: body 必含 Repro:<命令>
（.husky/commit-msg 机器强制）；fix 与 feat/refactor
禁止同 commit；硬门禁由 nightly ledger 7 天斜率裁决；
账本 docs/audit/loc-ledger.jsonl，代理无自评权

R-03 不删断言只迁移：覆盖率 ≥ 迁移前

R-04 金融计算字节级一致：统计/回测/MC/优化器改动必过
go test ./engine-go/... -run TestStatisticsGoldenFile -v
新增统计函数：先写 golden 后写实现；
gonum 替换 ULP 偏差须上报人类裁决

R-05 契约红线：Engine fail-closed/Data+Compute degraded
语义、审计 HMAC+outbox 双写、RBAC 密钥哈希(ADR-007)、
OpenAPI contract 15/15 含金丝雀；扫描器变更=契约变更同 PR 补 ADR

R-06 性能优化师出有名：无基准数据不加 memo/useMemo/useCallback

R-07 提交纪律：Conventional Commits·语义分割·随做随测

R-08 三值标签 + /** @internal */ testExports.ts 聚合

R-09 侦察先于建设；侦察与预算冲突→停止报告不继续执行

R-10 并发写者纪律：开工前 git log --since='24h' -- <目标>；
收口前 git pull --rebase

R-11 盈亏平衡前置：Σ(块大小×次数) < helper成本×2 → 不开工

R-12 数据质量红线：AdjustedClose 仅源确认复权时写入
（*float64 nil 语义）；消费端 adjusted_close ?? close；
新增数据源必须在 registry.go 注释块登记复权状态

R-13 手册自身一致性："在线/已完成"必须附【实测】；
每次修改手册须重验所有"在线"声明仍为真；
违反等同违反 R-08

═══════════════════════════════════════════════
§4 产品路线图（竞品研究 v3 · 紧迫度排序）
═══════════════════════════════════════════════

执行原则：不追功能完整性，追差异化深度。
每功能自问：这让"数字可验证"叙事更强吗？
6-9 个月内 testfol 会复制吗？

── P-URGENT 3 个月内 ──
U-1 数据质量校验徽章（绿=复权校验通过/黄=降级列表可展开）
基础：degraded 三处一致✓+A4✓ ΔLOC ~80【推断】

U-2 真实日频 T-bill 替换固定 riskFreeRate
现状：engineutil.go:115 const RiskFreeRate = 0.02【实测】
Foliolytic 实证静态假设致 Sharpe 偏移 0.3-0.5
动作：data-fetcher 新建 FRED provider（现有四源均无）
→ 新建存储迁移 → 引擎按日查询
（注意：macro 服务层测试在但 PG 表不存在，均为新建件）
ΔLOC ~120±40【推断】

U-3 MC 估计法菜单扩展（block bootstrap 之上加
Trimmed Mean/Equal-Weight Mean/Ledoit-Wolf Shrinkage）
对标 PMetrics 参数化天花板；golden 兜底
竞品锚点：testfol 免费层 500次/15年/5年块
ΔLOC ~120【推断】

── P-HIGH 3-6 个月 ──
H-1 高级指标包（PSR/Hurst/Burke/Martin/Sterling/M²/
Batting Average——Foliolytic 公式公开，golden 锁定）
ΔLOC ~100 Go+前端【推断】
H-2 季度相关矩阵序列（对标 AWALYT；现仅静态矩阵）
ΔLOC ~50【推断】
H-3 再平衡交易日志升级（权重快照→买卖金额/数量）
ΔLOC ~70【推断】
H-4 FF 结果页内建化（factor exposure 卡嵌入 BacktestResults；
落地后 §1 六角交集主张完全成真）
ΔLOC ~30-50【推断】

── P-MED 6-9 个月 ──
M-1 per-ticker 费率 ~40 / M-2 sim-fund 框架 ~150+脚本
M-3 匿名演示 /demo ~60 / M-4 AI 解释层（前置 U 档）

── 明确不做（附重启条件）──
公司基本面(AWALYT 主场) / 券商CSV导入(Foliolytic 永久免费)
Black-Litterman(PV 护城河) / 移动端重构(流量>30% 再议)
实盘工作台 / brotli 流式重构 / application 编排层

═══════════════════════════════════════════════
§5 工程战线状态板（@ceffc913）
═══════════════════════════════════════════════

✓ 口径固化 count-prod-loc.ps1 @f3e37b8b
✓ SSR 收敛 cef5c228 净−344（fallback 仅+6 行）
✓ ε-2 .husky/commit-msg（负向探针实证@本会话）
✓ A4 复权置空 f4025e38 ±17（NULL 链路全通）

□ A5 queued 行落库：jobSubmission queue.add 后 INSERT
ON CONFLICT DO NOTHING + worker UPSERT + stalled 对账
预算 +30±10【推断】
□ D-5 i18n 删除：先跑 tests/e2e/ui/i18n-sampling.spec.ts
生成候选清单（当前产物缺失），人类确认后删
预算 −100~~200【推断】← G-1 达标最近路径
□ gonum spike：S1 mathutil 对照表/S2 调用计数/
S3 _spike_test.go golden 输入对比（不提交）
裁决：<50 行关闭；≥50+字节级过→立项；ULP→上报
预算 −200~~400【推断·低置信】← G-1 达标另一路径
□ page-smoke 稳定化：tests/e2e/ui/page-smoke.spec.ts
层1 reducedMotion / 层2 localStorage 浮层预设 /
层3 domcontentloaded+waitForSelector
门禁：--repeat-each=10 全绿才挂 ci.yml
□ B3 文档三缺口：README 部署章节(现仅54行)/compose
资源限制(YAML 锚点压缩)/ADR-012 撞号重编号
预算 +30~55

═══════════════════════════════════════════════
§6 预算全景（基线已迁移至净口径 52,117）
═══════════════════════════════════════════════

已兑现累计：α−34 β−29 gonum替换−89 第8会话fix+152
SSR−344 A4+17 A5+46 B3+39 → 净 −282【全部实测】

G-1 即时状态：52,117，距 ≤52,000 差 117 行
达标路径：仅剩 D-5（−100~200）；gonum 已关闭

产品档位增行预算：见 §4 各条【均为推断】
三档情景方法论保留：悲观/中性/乐观 = LOC 最坏程度
分档（非发生概率）；功能档全兑现稳态约 53k±200，
此时 53k 即正确目标（人类已裁决：差异化>行数美学）

═══════════════════════════════════════════════
§7 决策树（每次会话执行）
═══════════════════════════════════════════════

ROOT 基线扫描（任一失败先修复不带病开工）：
pnpm loc ±5 ｜ test:unit 全绿 ｜ test:contract 15/15
test:property 24/24 ｜ check:tests 0 ｜ lint 0e/≤2w
verify-static PASS ｜ go golden PASS
git log --since='24h' -- <目标> 无冲突 ｜ status 空

├ 回归？→ 修复归因回 ROOT
├ 并发改动？→ diff 审读（R-10）
STEP-0 收割类先做 R-11 盈亏平衡
STEP-1 侦察出实测数字 → 冲突即停（R-09）
STEP-2 执行：独立 commit·随做随测·golden 校验
└ 实测<预期 50%？→ 止损转收口
STEP-3 收口（§8）

═══════════════════════════════════════════════
§8 收口报告格式
═══════════════════════════════════════════════

## 会话收口报告

基线→产出：开工/收口 LOC（全仓+净生产）/commit 列表
[hash|内容|ΔLOC|Repro(fix 必填)]
套件状态：unit/contract/property/check/lint/verify-static/
golden/Go
各步结果：✓/⚠️止损(原因)/❌失败(归因)
R-02：ΔLOC 构成 + ledger 最新条目
必填：isolated-variables / untracked-touched /
推断-used-as-basis
ε 一致性检查（R-13）：ε-1/ε-2/ε-3 逐项实态
待人类裁决 / 下会话建议

═══════════════════════════════════════════════
§9 代理行为规范
═══════════════════════════════════════════════

必须：ROOT 全过才开工｜侦察先于建设｜三值标签｜
改一文件测一文件｜完整收口含 ε 检查｜
便宜的确证优先于大概率成立

不得：删断言｜改数值代码不跑 golden｜推断作行动依据｜
跳过并发检查｜建设前不侦察｜计划写成已在线(R-13)｜
代做产品方向决策

必须停止上报：预算冲突/触红线/覆盖率下降/ULP 偏差/
裁量粒度/产品方向

═══════════════════════════════════════════════
§10 不变式红线（PR 合并前人工确认）
═══════════════════════════════════════════════
□ 统计/回测/MC：golden 字节级通过
□ degraded 改动：contract 15/15
□ outbox/HMAC：审计集成测试通过
□ RBAC(ADR-007)：密钥哈希路径未变
□ ADR-008：503+Retry-After + degraded 语义未变
□ OpenAPI 变更：contract 全绿
□ AdjustedClose 改动：registry.go 复权登记已更新(R-12)
□ 新增统计函数：golden 先行
□ 手册"在线"声明与仓库实态一致(R-13)

═══════════════════════════════════════════════
§11 速查：核心命令
═══════════════════════════════════════════════
pnpm loc # 全仓权威口径
powershell -NoProfile -File scripts/count-prod-loc.ps1 # 四层口径·G-1 权威
pnpm test:unit / test:contract / test:property
pnpm check:tests / lint / verify-static / audit:i18n
go test ./engine-go/... -run TestStatisticsGoldenFile -v
go test ./engine-go/... -v
cd data-fetcher; go test ./... -count=1
gofmt -l ./engine-go/ && go vet ./engine-go/...
npx playwright test tests/e2e/ui/page-smoke.spec.ts \
--project=chromium --repeat-each=10 --reporter=line
npx playwright test tests/e2e/ui/i18n-sampling.spec.ts
git log --oneline --since='24h' -- <目标目录>

───────────────────────────────────────────────
v3.2 变更摘要（相对对话稿 v3.1）
固化 手册首次写盘（此前 v3/v3.1 仅存于对话）
快照 全部锚点刷新至 @f4025e38 实测
兑现 SSR 收敛/A4/口径脚本/ε-2 实证 四战线落库
勘误 ε-2 实态=在线(husky 内联)；U-2 基建句修正；
G-1 从"结构性不可达"改为"差 71 行可达"
新增 H-4 FF 内建化战线；R-13 保留并实例化
归档 v2.2 旧手册由 git 历史承担（docs 树经清点
无独立计划文档需移动）
