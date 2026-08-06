# 全仓"彻底重写思维"审计报告 v6（替代已归档的 plan.md / plan2.md）

**审计范围**：全仓 TS/TSX/JS/Go/CSS/SQL/YAML/MD/配置/测试（排除 node_modules/dist/coverage/.git/.turbo）。
**基线**：110,361 行 / 789 文件（scc 口径，`scripts/count-loc.ps1`）。已从 179,541 行 -69,180（-38.5%）；-30% 目标 125,678 已达成；-50% 目标 89,770。
**方法**：只读审计 + 多轮并行探索 + 人工抽验；全部 findings 已 file:line 核证。脏文件（`git status --short` ~200 个，正在改造中）一律不进 A 区。

**执行状态（后续会话据此续跑）：**

- ✅ 已完成：A1-P1/P2/P4/P6/P7/P8/P10/P11/P12/P13、A2-F1/F2/F3/F4/F5/F7/F8/F11/F12/F13/F15/F16、A4 全部、A5 全部、A6 全部、A7 全部、A8、A9、A10、A11、B1-2/B1-3/B1-5/B1-8、B2-2/3/4/5/8/9/10/11/12/13/14、B3-2/B3-3、B4-1、B5 全部、C 全部。
- ⛔ 延后（净负/外观/行为风险，待逐项复查）：A1-P3 残留、A1-P5 残留、A2-F14、A2-F17、A3-A(部分)、A3-B、B1-1、B1-4、B1-6、B1-7、B1-9、B2-1、B2-6、B2-7、B3-1、B3-4、B3-5、B3-6、B4-2。
- 后续执行基准：基线 `pnpm loc` 109,749 行/785 文件；整仓 423 脏文件允许修改，逐文件 prettier + vitest + `pnpm check` 验证。

**总盘子：A（干净文件可立即执行）≈2,033 行 + B（脏文件阻塞，待 refactor 落地）≈567 行 + C（非代码）≈295 行 ≈ 2,900 行。**（A1-P1/P2/P5/P4/P7/P8/P6/P12/P9/P11/P10 + A2-F1/F4/F6/F2/F3/F5/F8/F11/F7/F12/F16/F13/F15 + A3-A(3/4) + A4 全部 5 项 + A5 全部 8 项 + A6 全部 3 项 + A7-E3/E2/E1 + A8 + A9 + A10 + C 区全部 5 项已执行，实际净 ≈ **−1,553**：P1 −25、P2 −21、P5 −3、P4 −17、P7 +3、P8 −15、P6 −27、P12 −12、P9 −2、P11 −5、P10 −34、F1 −21、F4 −21、F6 −8、F2 −15、F3 −28、F5 −19、F8 −36、F11 −13、F7 −16、F12 −16、F16 −2、F13 −7、F15 −2、A3-A −25、A4-1 −15、A4-2 −11、A4-3 −5、A4-4 −2、A4-5 −1、G1 −69、G7 −6、G2 −19、G3 −30、G4 −13、G5 −26、G6 −3、G8 −3、GT1 −46、GT2 −20、GT3 −3、E3 −36、E2 +2、E1 −18、A8 −75、A9 −47、A10 −132、P3 −13、C-1 −12、C-2 −9、C-3 −15、C-4 −371、C-5 −213（磁盘；git 口径见条目）；audit 估值为上限导向，实际以 git diff --numstat 为准，P5/P4/P7/P9/P11/F1/F6/F2/F3/F5/F11 显著低于估值因行为/外观约束或移动而非删除，A4-4/5 显著低于估值因空 div 本就 4 行、共享组件 +5 抵消，G2/G4/G6/GT3 显著低于估值因表驱化对整行数据字面量/异构断言集的测试收益有限，A9 低于估值因两入口 shutdown 差异大仅核心可共享，E2 为提取式规范化净 +2（69 估值需删断言，见条目），P3/F14 低于估值见各自条目，F17 跳过、A3-B 延后见条目，C-4 远高于估值因含两个零引用脚本文件本体（generate-openapi.ts 186 + check-input-widths.mjs 100）。**另：既存失败修复（全绿前处置）** 17 个失败测试清零（montecarlo/optimizer-application/store backtest-helpers）+ 后端 tsc 29→0 + 前端 tsc 38→0 + ioredis 未处理错误噪音清零，见 A11。）

---

## A. 干净文件可立即执行（≈2,033 行）

### A1 前端 MonteCarlo + 图表族（P1–P13，≈650）

- **P1** ✅ 已执行。MonteCarlo 直方图双实现 + "No data"卡×5 → 新建 `HistogramChart`+`NoDataCard`（HistogramChart.tsx 79 行）；MonteCarloScenariosTab/RangeTab/Results 重接线。净 **−25**（git diff --numstat 实测：3 文件 −104、新文件 +79）。
- **P2** ✅ 已执行。共享 `MiniSelect`（uiComponents.tsx 尾部，泛型 T extends string|number，含 aria-label/className 透传）替代 4 处逐字相同 select（rolling.tsx 双 select + rolling 指标 + riskReturn 指标），并内联删除 RollingMetricSelector/RiskMetricSelector 两个薄包装。`CorrelationHeatmapChart`/`DrawdownEpisodes`/`AccountPage` 因样式 token 不同（--border-soft/--bg-elevated 等）保留原样，避免改外观。净 **−21**（rolling −38、riskReturn −18、uiComponents +35）。
- **P3** ⚠️ 部分执行。`computeNiceTicks`（13-26）与 svgChartParts.computeTicks 算法逐字等价（仅 guard 不同，但本调用 `yMin-yPad, yMax+yPad` 因 yPad≥1 永不触发 `min===max`），→ 删本地函数、import computeTicks。净 **−13**（259→246）。其余 ⛔ 延后：ResizeObserver 35-46 复用需导出共享 ChartContent MeasuredContainer 且其容器无 `relative`（tooltip 需 absolute 定位锚点），改动面 > 收益；axes 120-195/tooltip 209-238/legend 239-256 与 svgChartParts 的 token（--border-subtle vs --border-soft、fontSize 11 vs TICK_STYLE、grid 实线 vs dash 3 3）及行为不同，按"不改外观"先例不合并（同 P5/F14）。
- **P4** ✅ 已执行（放宽视觉统一后）。新建共享 `SERVICE_DEFS`（三服务目录：go_engine :15004 / go_data_service :3003 / nodeServer :3001）+ `buildServiceHealths`（adminStats.ts 追加，修复 SystemSettings 读死 key `goDataService`→`go_data_service` 的 bug，node 默认 down→healthy）+ `ServiceStatusTable`（AdminLayout.tsx）。SystemSettings 删 DEFAULT_CONFIG.services/buildServicesFromApi/手写状态表；SystemMonitor 删 ServiceHealth 接口 + buildServiceHealth + fetchServices。AdminDashboard 保留（已用 adminStats + KpiCard）。净 **−17**（adminStats +51、AdminLayout +25、SystemSettings −56、SystemMonitor −37）。
- **P5** ⚠️ 部分执行。audit 高估：`SinglePortfolioEditor` asset row（h-8 AffixInput+销毁按钮）与 `AssetWeightRow`（h-9 Input+% span+悬停删除+ticker 元信息）、`AllocationBar+TotalWeightBlock` footer 与 card footer（tw%+dot）**视觉/行为不同**，按"不改外观"原则不合并。仅真实重复 `toAssetsWithIds`（portfolioEditorCard.tsx 197-202 ≡ backtestHelpers.ts createPortfolioFromPreset 内联 122-126）→ 提升到 `backtestHelpers.ts` 导出复用。净 **−3**（card −5、helpers +2）。
- **P6** ✅ 已执行。errorBoundaries 双子 UI：新建共享 `ErrorFallback`（标题/描述/错误详情/操作按钮结构合一）；合并 ERROR_DETAIL_STYLE/ROUTE_ERROR_DETAIL_STYLE → 单一 `ERROR_DETAIL_STYLE`；删除 STYLE_TAG 手写 hover 覆盖；两套按钮样式（REFRESH/RETRY_BTN_STYLE）→ 共用 uiComponents `Button variant="primary"`。容器样式保留两份（全屏崩溃页 vs 路由卡片页）。净 **−27**（217→190），error-boundary 测试 5/5 绿。
- **P10** ✅ 已执行。CorrelationHeatmapChart `RollingCorrelationLineChart`（48 行手写 recharts LineChart/CartesianGrid/ChartXAxis/ChartYAxis/ChartTooltip/ReferenceLine×3/Brush）→ `TimeSeriesLineChart`（series 单序列 strokeWidth 1.5、height 300、yDomain [-1,1]、referenceY 0、showBrush），与 rolling.tsx 同图 canonical 形式一致（±1 边界线随之省略，同 rolling.tsx 先例）。import 净 −8（recharts 7 行 + chart-theme + sharedChartContent 移除，加 TimeSeriesLineChart 1 行）。净 **−34**（组件 48→22），chart-calculations 16/16 绿；同时修复 pageLoaders.ts 遗留 TS2352（`Object.fromEntries` index 类型不能直接 cast 具名 Record → 去掉注解+cast，消费者 `createElement` 仅需 ElementType）与 sharedChartContent 未用 `Scatter` import。
- **P13** ✅ 已执行（随 P2/P7 同文件 in-flight 一并落地于工作树）。riskReturn `RiskReturnScatter` 手写 labeled scatter → `XYScatterChart`（children 传 `Scatter`+`LabelList` 逐点标注，见 `charts/riskReturn.tsx:115-142`；sharedChartContent:421 children 渲染 460）。该文件工作树 diff 累计 −52（P2+P7+P13 合并），P13 份额约 −30 与审计一致；tsc 干净、chart 测试绿。
- **P7** ✅ 已执行（放宽视觉统一后）。rolling ×2 + riskReturn ×1 手写 `.chart-card` 头 → `ChartCard`（title + headerExtra slot，与 RollingReturnChart 同款；card 内 `chart-card-title`/`mb-3` 移除）。净 **+3**（纯统一价值，非行数收益：chart-card→ChartCard 需 title/headerExtra/`>` 三行包装）；rolling/riskReturn 累计（P2+P7）−34/−17。
- **P8** ✅ 已执行。dataEngine 卡片原语：`MiniBar`（10 行）→ 内联 `Progress`（两处调用点）；`ProgressBar` 手写 bar → `Progress`；手写 skeleton → `Skeleton`。净 **−15**（cards −5、distribution −10），tsc 干净。
- **P12** ✅ 已执行。DataManagement STATUS_CONFIG（17 行）+ 手写 status span → 复用 AdminLayout `ServiceStatusBadge`；共享 STATUS_CONFIG 新增 `unknown` 状态（bg-elevated text-fg-tertiary）。净 **−12**（DataManagement −20、AdminLayout +8），tsc 干净。
- **P9** ⚠️ 已执行，净近 0。新建 `routes/pageLoaders.ts`（27 行）单一 `loaders` 表（15 个路由名→动态 import）+ `preloadPage`（内部守卫 no-op）+ 派生 `PAGE_LOADERS` lazy 表；routes/index.tsx 删 15 个 `const X = lazyDefault(() => import(...))`（37 删/25 加，净 −12，改用 `page('name')` 助手）；Navbar 删 NAV_PRELOADS（净 −17）。净 **−2**（routes −12、Navbar −17、pageLoaders +27）：audit 估 20 高估——本质是"移动而非删除"，收益是 15 条 import 路径单一事实源 + `PageName` 类型化，非行数。Navbar 内 `to.slice(1)`→路由名映射（'/'→backtest、portfolio-comparison 走守卫 no-op）。pages/promo-bar/plan-badge 测试 21/21 绿；LayoutStability C-006 源守卫改指 pageLoaders.ts（lazy 包裹改在 `lazyDefault` 内，断言 loaders 表含 backtest→BacktestPage 动态 import + `lazy(imp)`）。
- **P11** ✅ 已执行。CorrelationHeatmap 空态双实现：删 NoDataCard（9 行）→ 统一用 `EmptyState`（三处调用点；顶层"至少 2 资产"保留 `.chart-card` 包裹以与兄弟卡片一致）。净 **−5**，tsc 干净。

### A2 前端工具家族（F1–F8、F11–F17，≈400）

- **F1** ✅ 已执行（riskReturn 在 P13 −52；本会话 RegressionChart + EfficientFrontierCharts）。3 个手写 recharts ScatterChart → XYScatterChart。`RegressionChart.tsx:85-131` → XYScatterChart（xName/yName=Benchmark/Target Daily Return，xLabel/yLabel=标的组合名保标签语义，cursor={false}，ReferenceLine segment + Scatter 传 children）。`EfficientFrontierCharts.tsx:37-90` → XYScatterChart（zRange=[60,60] 保气泡大小，Scatter onClick+Cell 配色 + maxSharpe star 传 children）。共享 XYScatterChart 增可选 `xLabel`/`yLabel`/`cursor`（向后兼容，+5）。净 **−21**（Regression −9、Frontier −17、shared +5）；pages/components 测试 97/97 绿。
- **F4** ✅ 已执行。CashflowsLog 双手写表（Periodic 50 行 + OneTime 40 行 + TH_BASE/TD_BASE 3 行）→ 两列配置 SimpleTable；amount 条件色（text-pos/neg）移入内部 span 保持外观，right align 自动获得 font-mono。净 **−21**（141→120），backtest-page 测试 2/2 绿。
- **F6** ⚠️ 部分执行。audit 高估：5 处"相同"apiFetch POST 实际各异——factorRegressionUtils ×2、EfficientFrontierUtils ×2（fetchCorrelations `!ok return null` 不可换）、rebalancingSensitivityBuilders ×2（脏文件 + `HTTP (${label})` 上下文 + `!ok return {offset,cagr:0}` 不可换）。apiPostJSON 增两处对齐：`(json.data ?? json)` 裸响应回退 + `json.error?.detail ?? json.error` RFC7807 detail 提取（+0 行，api-client 测试 10/10 绿）。可换 3 处：factorRegressionUtils analysis（errFetchData 语义保留，HTTP 错误消息统一为 `HTTP {status}`）、factor-regression（.detail 现由 helper 处理）、fetchFrontier（纯换，错误消息逐字一致）。净 **−8**（factorRegression −4、EfficientFrontier −4），其余保持。
- **F2** ✅ 已执行。useEfficientFrontierStateInner 10 个 useState → 单一 `useSetterState`（10 字段 initial + `...s` 展开，与 useFactorRegressionState 同款）；删 useState import。净 **−15**（257→242）；audit 估 38 高估——initial 对象 10 字段本身占行，收益在去掉 10×`const [x,setX]=useState` + 20 行显式 return。
- **F3** ✅ 已执行。ConclusionSection StatsTableHead(24)+StatsTable(40) → 转置 SimpleTable（data=STATS_ROWS，columns=Metric+每 result 一列，右对齐+表头色点+行过滤+fmtVal 保真）。净 **−28**（291→263）；audit 估 36 高估——fmtVal/STATS_ROWS/色点/过滤逻辑本身不可删。
- **F8** ✅ 已执行。chartCalc.worker 8 分支 switch（52 行）→ `HANDLERS` record（payload 解构 + 类型断言保签名）+ 显式 handler 存在检查（`Unknown worker task` 错误保真）。净 **−36**（124→88）；chart-calculations 测试 16/16 绿。
- **F5** ✅ 已执行。FrontierAllocations 手写 AreaChart（44 行）→ SimpleChart type="area"（xDataKey=point、yDomain [0,100]、`${v}%` formatter×2、showLegend=false 保自绘图例）；recharts 导入收敛为 Scatter/Cell/Area，删 TICK_STYLE/LABEL_FILL 常量 + CHART_TOOLTIP_STYLE/CHART_GRID_PROPS 导入。净 **−19**（184→165）；audit 估 22 高估——图例 div + Area map children 本身不可删。
- **F11** ⚠️ 已执行，未做按钮表驱化。`ResultsActionBarProps` + `ActionBarActionsProps`（8 行 ×2 完全相同 callback 字段）→ 后者保留、前者 `extends` 合并；ActionBarActions 调用点 6 行 → `{...props}` 展开（3 行）。净 **−13**（133→120）；audit 估 18 高估——按钮表驱化实测为平局：Badge 行 + map + 配置表 ≈ 原 4 按钮，且引入 `LucideIcon` 类型导入撑爆 prettier 单行 import（+8 行），已回退，仅保留接口合并 + spread 两项真削减。
- **F7** ✅ 已执行。SignalSelector SignalRow 内联 indicator Select（12 行 + 5 个 uiComponents import + INDICATORS 依赖）→ 复用 SignalParamsPanel 导出的 `IndicatorSelect`（新增可选 `id`/`triggerClassName` 保 h-9 w-[120px] 外观，+3）。净 **−16**（SignalParamsPanel +2、SignalSelector −18），tsc 干净。
- **F12** ✅ 已执行。buildTurnoverColumns 4 个数值列 5 行 render span（font-mono/tabular-nums/text-right/block + 各色）→ 局部 `rightCell(children, cls)` 助手（+4 行）。净 **−16**（173→157）；audit 估 8 低估——4 个 5 行 block → 4 个 1 行 render。
- **F14** ⛔ 延后。audit 低估合并成本：ParamCard（paramsLayout.tsx:25-32）用 `text-caption text-fg-tertiary` + min-w-0 + fullWidth/style/className 透传，LabeledField（sharedFields.tsx:38-53）用 `Field+FieldLabel text-label font-medium`——样式 token 与 props 面均不同，影响 19 处 ParamCard 调用外观。估净 ~7 但改外观，按"不改外观"先例（P5）不合并。若未来统一卡片 token 可重估。
- **F13** ✅ 已执行。FREQ_ORDER 硬编码 5 项（daily→annual 0-4）→ `Object.fromEntries(REBALANCE_FREQUENCIES.map((f, i) => [f, i]))`（REBALANCE_FREQUENCIES 已 import）。净 **−7**（8→1）；类型保持 Record<string, number> 兼容 rebalancingSensitivityUtils.ts:130 用法。
- **F16** ✅ 已执行。AnalysisParams 手写 SwitchField + toggleAllHistory（5 行）→ 复用 `AllHistoryCheckbox`（toolFields.tsx，已由 factor-regression/efficient-frontier 使用）；`allHistory` 仍用于 DateField disabled。净 **−2**（167→165）；audit 估 5 高估——SwitchField 块与 AllHistoryCheckbox 等长，纯收益仅 toggleAllHistory。
- **F17** ⛔ 跳过。audit 高估三处均不成立：① `currencyFormatter`（chart-theme，固定 digits）vs `formatCurrency`（format.ts，自适应 digits + null 处理）行为不同，GrowthChart 需显式 digits（axis 0 / tooltip 2），合并即改行为；② `formatNum`（M/K 紧凑格式）全仓唯一，无同款可收敛；③ LumpSumVsDCAPage `fmtMoney` 的 ¥ 分支仅此一处，提取需改脏文件 format.ts 且净收益 ~0。
- **F15** ✅ 已执行。validateGridParams 内组合数计算（3 行：两个 floor+1 相乘）→ 复用 `countCombinations(param1, param2)`（tacticalGridUtils.ts:92-96 既有）。净 **−2**。

### A3 前端 params 家族（≈86）

- **A** ⚠️ 部分执行。3/4 手写 prefix/suffix span → `AffixInput`（uiComponents.tsx:128-152 已有）：`MonteCarloParams` BasicField（−10，suffix pr-10→pr-8 微差）、`AnalysisParams` MonthWindowField（−4，className="pr-14" 经 cn/twMerge 覆盖 pr-8 保 "months" 不重叠）、`sharedFields` PercentInput+DollarInput（−11，showPercent=false 裸 Input、$/% 前后缀由 AffixInput 处理）。净 **−25**；`BaseCalculatorUI` Field ⛔ 阻塞（脏文件）。audit 估 45 高估——props/type 块本身不可删。
- **B** ⛔ 延后。SignalParamsPanel 三 Select 中仅 COMBINATION_METHODS/SIGNAL_TYPES 可用 sharedFields `SelectField`（−21）；`IndicatorSelect`（F7 已导出、SignalSelector 复用）签名不同——无 label、需自定义 triggerClassName，不可替换，故 B 收益减半；且 SignalParamsPanel 本会话已改动，留待 A2 脏文件清理后合并处理。

### A4 前端次阈值干净扫（≈45）— 全部完成

- **A4-1** ✅ 已执行。TacticalGridParams ParamRangeRow 表驱化 → `RANGE_FIELDS` 表（`{key,label,min?,step?}`，index 签名类型，`f.min ?? inputMin`）。净 **−15**（37→24，audit 估 13 低估）。
- **A4-2** ✅ 已执行。OptimizerParams AdvancedConstraints 百分数/普通输入三元 → 单 `<PercentInput showPercent={f.percent} .../>`。净 **−11**。
- **A4-3** ✅ 已执行。VerifyEmailPage statusIcon 三元 → `STATUS_ICONS` record；LoginPage sessionMessage useMemo → 普通 const（删 useMemo import）。净 **−5**。
- **A4-4** ✅ 已执行。SignalAnalyzerResults/DualSignalResults 空 div ×3（4 行/处逐字相同）→ 新增共享 `TableEmpty`（stateDisplay.tsx，`py-6 text-center text-body text-fg-tertiary` 保真）；第 4 处消费点 backtestOptimizerComponents.tsx:392 ⛔ 脏文件未换。净 **−2**（stateDisplay +4、SignalAnalyzerResults −5、DualSignalResults −1）；audit 估 8 高估——空 div 仅 4 行，组件本身 +4，收益来自 3 处消费 ×(−3)。
- **A4-5** ✅ 已执行。AnalysisParams/OptimizerParams 4 行空行 tag 处理器（逐字相同，但基于 `setTickers` 纯数组，非 useTagDiff 的行列表 add/remove/update 语义，useTagDiff 不适用）→ 共享工厂 `useEmptyRowTagChange(tickers, setTickers)`（toolFields.tsx，与 useTagDiff 同款非 hook 工厂）。净 **−1**（toolFields +5、OptimizerParams −2、AnalysisParams −4）；optimizer-page 测试 2/2 绿，tsc 仅剩预存 GoalOptimizerParams 噪音。

### A5 Go 干净（8 项，≈293，全部完成）

- **G1** ✅ 已执行。泛型 `ParseCase[In,Out]` + `RunParse` 表运行器（testutil.go，含 WantErr 短路 + `assert func(*testing.T,Out,Out)`）+ `AssertPricesEqual`（适配既有 AssertPrices）+ 泛型 `AssertEqual[T comparable]`（按元素比较，替代 2 处手写 results[i]!=w 循环）。6 个同骨架循环收敛：finnhub candle/search、yfinance chart/search、twelvedata timeseries（start/end 提为闭包常量）、akshare daily（klines+dataNil 并入局部 `parseDailyInput`）。表字面量改 keyed（规避 go vet composites）。净 **−69**（finnhub −47、yfinance −41、twelvedata −23、akshare −11、testutil +47）；audit 估 70 准确。顺手修复 akshare 预存 flaky `TestDoWithRetry/success`（FastFailClient 1ms ReadTimeout 读 httptest 响应必超时 → 换 `httpclient.New` 默认超时 + RequestDelay 1ms + MaxRetries 1，保 retry 语义与速度）；`go vet` 干净、data-fetcher `go test ./...` 全绿。
- **G2** ✅ 已执行。sim_splice_test 表驱化：`TestSanitizePrices` 5 测试 → 单表（精确 want，DeepEqual）、`TestApplyExpenseRatio` 4 测试 → 单表（tol 1e-6 + `priceRow` 行构造）、`TestNormalizeAndMergeSegments` 3 测试 → 单表（新 `seg(source, closes...)` fixture 合并入）、IsSIMTicker/GetSIMDefinition 各 2 测试 → 各 1。净 **−19**（86/105）；audit 估 68 严重高估——测试数据整行字面量（Date/OHLC/Volume 6 字段）在表里与单测体同长，dedup 收益仅函数签名 + run 循环；断言全保留（空输入/首行不变/零费率/换高低/夹取/负量清零/合并比例/无效 ticker）。worker 全包测试绿。
- **G3** ✅ 已执行。VaR/CVaR 边界 6 测试（edge confidences ×2 + subnormal ×2 + nil ×2，72 行）→ 单表 `TestRiskMetricEdgeCases`（`calc func([]float64,float64) float64` 字段驱动 12 行，`wantFinite` 区分 subnormal 的 finite 断言 vs 常规 got==0 断言，vaRReturns/cvaRReturns 包级 var 去重）。净 **−30**（28/58）；audit 估 48 高估——calc fn 字段使 VaR/CVaR 各 6 行、wantFinite 分支保断言差异，72→44 是含类型化 fn 的真实下限。12/12 子测试绿。
- **G4** ✅ 已执行。三个"数据不足"测试表化：pca `TestPerformPCA_InsufficientData`（3 子测试 → `PCARequest` 字段表，全 case 统一 err + nil result 断言——error 路径返回 nil 已核实 pca.go:29/97、letf.go:80）；letf `TestAnalyzeSlippage_InsufficientData` 同式；factorregression `TestRunRegression_InsufficientData`（零值断言表，`ff` 提到表外复用去重）。净 **−13**（pca 19/22、letf 19/26、factorregression 22/25）；audit 估 40 大幅高估——错误路径测试的 req 字面量占位主导，子测试脚手架仅 ~7 行/个。11/11 子测试绿。
- **G5** ✅ 已执行。pca.go 33-87 矩阵块 → 列主序：`returns[j]` 逐 ticker 经 `mathutil.DailyReturnsWithZeros(col)`（col 从 commonDates 直接取价，删 7 行 `prices` 死矩阵 + 手写 returns 双循环）；`stdReturns[j]` 列向量化删 `stdCols` 转置（11 行）与 `means` 数组（内联 `mean` 局部）；cov 两循环合并为一。scores 行 152 索引换位 `stdReturns[j][i]`。净 **−26**（14/40）；audit 估 22 略低估。行为注意：`DailyReturnsWithZeros` 判定 `prev > 0` vs 原 `prev != 0`——PCA 价格为资产价恒正，等价；公共 API/输出不变，`go vet` 干净、全包测试绿。
- **G6** ✅ 已执行。`successFractionAtOrAbove(paths, day, target)` 包级 helper 合并 2 处相同 `count >= target` 循环：computeMCStatistics（successCount 循环 → successRate 一行，day=len(paths[0])-1 等价 finalValues 末列）与 computeSuccessProbability（去 numSims + 双层循环 → 单行调用）。净 **−3**（12/15）；audit 估 21 严重高估——computeSuccessProbabilities 的 3 个计数用 `>0`/`>=`/`>` 三种谓词、无法并入 `>=` helper（泛化谓词反增行），同形循环全仓仅 2 处。全包测试绿。
- **G7** ✅ 已执行（G1 后顺带）。finnhub/twelvedata `TestNewProvider_WithoutAPIKey` 手写 env 保存/恢复（os.Unsetenv+defer 恢复）→ `t.Setenv(KEY, "")`（`key == ""` 判定语义等价）。净 **−6**（各 −3）；audit 估 19 高估——手写块本就仅 5 行，t.Setenv 版 4 行。
- **G8** ✅ 已执行。6 处 `data := engineutil.ToPricePoints(enginetest.PriceMap("2024-01-01", trendPrices()))` → 包级 `var trendData`（定义于 trendPrices 后）+ 各调用点直接 `trendData`。净 **−3**（17/20）；audit 估 5 接近。全包测试绿。

### A6 Go 测试表驱化（≈96，全部完成）

- **GT1** ✅ 已执行。store_test 7 个 filterPricePointsByDate 测试（80 行）→ 单表 `TestFilterPricePointsByDate`（`wantLen`+`wantFirst`/`wantLast` 边界断言字段，nil/empty 原同一测试拆分两 case，8 case 全行为保留：空/nil→0、全在区间→3、边界含首尾、仅 start/仅 end/无边界→2/2/3、全出界→0）。净 **−46**（32/78，80→34）；audit 估 42 准确。8/8 子测试绿。
- **GT2** ✅ 已执行。`runHandler` 泛化加 `reqPath` 参数（route 模式与请求路径分离，支持 `:ticker`/`:country` 参数路由）：HandlePriceData/HandleCPI 两个 4 行手写 gin 注册块删掉改用 runHandler；ready 200/503 双子测试 → `TestHandleReady` 表（fakePinger 字段，断言 code + JSON status 字符串）。净 **−20**（34/54）；audit 估 30 略高估。handlers 全包测试绿。
- **GT3** ✅ 已执行。TestDrawdownEpisodeFields 3 子测试 → `check func(*testing.T, DrawdownEpisode)` 表（同文件 TestComputeDrawdownCurve 既有模式），检测运行样板（detect+len Fatal+ep 提取）并入共享循环。净 **−3**（59/62）；audit 估 24 大幅高估——3 case 断言集本质不同（精确值 vs 符号 vs 区间 vs nil 性），字段驱代表会丢断言/不可读，check 闭包保真但仅省 ~6 行样板。3/3 子测试绿。

### A7 E2E/Property（≈132）

- **E1** ✅ 已执行。adapters.ts 16 适配器内联重复 fill → 5 个 helper（fillPortfolioEditor/fillTagInput/fillPlainInput/fillDateRange）+ 3 个工厂（portfolioFill/plainFill/tagFill）+ COMPUTE_PAGES 表（16 对象全保留，含各页专属 fill 如 PCA 日期 id、目标优化器目标/年限、战术网格 6 数字框、计算器 4 数字框）。净 **−18**（git numstat 32/50，263→245）。⚠️ 重写时丢失原 UTF-8 BOM（consumer fuzz-random.spec.ts:3 不受影响）；未跑 e2e（需 Playwright + 本地 dev 栈），靠 tsc + 结构核对兜底。
- **E2** ✅ 部分执行（净 **+2** git，specs −18、helper +20）。helper 新增 `warmUpSuite(browser)`（serial 套件 beforeAll 预热：独立 auth context，backtest.spec/backtest-performance.spec 两个 5 行 beforeAll → 1 行）+ `readCagrPercent(page)`（backtest.spec 本地 `getCagrValue` 12 行 → 共享 helper）。审计估 69 不可达：11×beforeEach 52→11 需删各页 nav/heading 可见性断言（违反"保留断言"原则），且 prettier 100 列下多断言 beforeEach 折叠仅省 0-1 行；gotoPage 对带断言块净省 ~0（goto 本就 1 行），login.spec 单行 beforeEach 仅省 1 行、helper +4 抵消。CAGR 21→3 高估：CAGR 读取仅 backtest.spec 一处（12 行），其余为不可删的可见性断言。净差 +2 来自提取式规范化（未来 spec 复用 warmup/CAGR 读取）。e2e 文件 tsc strict 通过（不在项目 include，独立校验）；e2e 运行需完整堆栈，未在本会话执行。
- **E3** ✅ 已执行。新建 `tests/property/pbtHelpers.ts` 泛型 `check<A extends readonly unknown[]>(arbs, run, numRuns?)`（映射元组类型 `{ [K in keyof A]: fc.Arbitrary<A[K]> }` 保 run 回调参数类型推断，内部窄化为 `fc.property` 调用；`as const` 提升数组保元组类型）。3 文件 fc.assert+fc.property 嵌套脚手架收敛：result-utils 10 测试（另加 `makeResult(n)` fixture 去 6 处内联 `{portfolios,correlations}` + keyArbs 三元组去 2 处重复，−44）、fuzz 7 测试（−4）、invariants 5 测试（±0）。净 **−36**（git numstat：result-utils 86/130、fuzz 74/78、invariants 37/37、pbtHelpers +12 未跟踪未计入）；audit 估 33 接近。25/25 测试绿、tsc 无新噪音。

### A8 路由测试 withServer（≈64）

- **A8** ✅ 已执行。新建 `tests/helpers/serverLifecycle.ts` `withServer(boot)`：返回闭包 getter（延迟取值，vitest 钩子已注册、it 运行时才可读——沿用 expressApp.ts useTestServer 的闭包风格），内部注册 beforeEach(启动)/afterEach(close)。转换 22 个 `let server`+beforeEach/afterEach 三件套 → 单行 `const getServer = withServer(() => ...)`（mock 设置并入 boot 闭包）：analysisRoutes 7 块、health-routes 3 块（额外 afterEach 清理保留原样）、backtest-routes 7 块、backtest-optimizer 2 块、data-routes 1 块、auth-routes 2 块。`server` 引用统一替换 `getServer().url`/`getServer()`。净 **−75**（git numstat：analysisRoutes 45/70、auth-routes 31/30、backtest-optimizer 15/26、backtest-routes 43/67、data-routes 9/14、health-routes 22/33，共 165/240；另 +11 未跟踪 serverLifecycle.ts 计磁盘）；audit 估 64 准确。routes 全目录 11 文件 291 测试全绿。per-it server 块（如 backtest-routes jobRoutes 401 测试、org/billing）保留不动。

### A9 后端优雅停机合并（≈40）

- **A9** ✅ 已执行。新建 `utils/gracefulShutdown.ts` `createShutdownOnce({onShutdown, timeoutMs, prefix})`：防重入 + 超时强杀 + finally exit，exitCode 按调用传（onShutdown 收 signal——worker 需透传 shutdownWorker）。server.ts 删 triggerShutdown(32 行)/setupGracefulShutdown/`let shuttingDown`/`Server` type import（server.close 包装为 Promise 并入 onShutdown）；workerEntrypoint.ts 删 shutdown 函数（40 行）与 `void` 包装。语义保留：server SIGTERM/SIGINT→0、uncaughtException→1、unhandledRejection 直接 exit(1)；worker 四信号全→0、timeout 60s/30s 各自保留。净 **−47**（git numstat：server 14/39、worker 11/33；另 +32 未跟踪 gracefulShutdown.ts 计磁盘 → 磁盘净 −15）；audit 估 40 高估——两入口 shutdown 差异大（server close http、worker 关 worker+heartbeat+透传 signal），仅"防重入+超时+exit"核心可共享，close/startup 表本就单侧存在。tsc 无新增错误（仅既有噪音：optimize-service/dataQuery/jwtAuth）。

### A10 Infra 孤儿脚本（≈227）

- **A10** ✅ 已执行。删 4 个零引用脚本：`scripts/flatten-i18n.mjs`(35)、`scripts/i18n-to-inline.mjs`(89)、`scripts/find-dead-i18n-keys.mjs`(37)、`scripts/find-dead-exports.mjs`(66)。rg 全仓（yml/yaml/json/mjs/ts/js/cjs/package.json）零引用确认。净 **−227**（磁盘口径，`pnpm loc` 目标口径；git numstat 仅见 flatten −36 + i18n-to-inline −96 = −132，因 find-dead-* 两文件系 untracked、git diff 不可见——删除前 `git ls-files` 证实未跟踪）。

### A11 既存失败修复（工程债，非行数收益，全部 ✅）

- **A11** ✅ 已执行。在途重构（backtest-helpers `preparePriceDataAndWarnings` 迁移、optimize-service 重构）完成后测试 mock 未跟上 + tsc 累积噪音：`montecarlo-service.test.ts` 改 async 工厂 mock（内联编排 + 保留兼容键）、`optimizer-application-service.test.ts` 14/14、store `backtest-helpers.test.ts` 删已删的 `createDefaultPortfolio` 依赖改用本地 `validPortfolio` fixture；后端 tsc 清零（dataQuery QueryResultRow + CB on cast、jwtAuth HS256 key 类型、jobSubmission `job.id!`、routes 补 `onQueueDown: 'fail-closed'`、metrics readonly labels → `[...l]` + Gauge cast）；前端 tsc 清零（formFields CSSProperties、miscHooks cache pending 处理、SinglePortfolioEditor/GoalOptimizerParams 加 `singleMode`、MonteCarlo tab 补 recharts import 等）；`redisConnection` 加 `lazyConnect` + debug 级 error listener 消除 unleashClient 模块级 `loadFlagSnapshot` 引发的 ioredis "Unhandled error event" 噪音（appRedis 既有 pattern 对齐）。验证：`tests/unit` 2464 passed/5 skipped、`tests/contract` 17 passed、`pnpm check` 4/4。注意裸 `tsc --noEmit` 恒过（根 tsconfig 为 `{"files": [], "references": []}`），必须 `pnpm check`。

---

## B. 脏文件阻塞提案（待 in-flight refactor 落地，≈567）— B1 部分执行、B2/B3/B5 全部处置、B4 部分执行

### B1 后端脏文件（9 项，≈171）— 部分执行

- **B1-1** ⛔ 延后。backtestResultUtils（singleflight + 双阶段 L1/L2 读）与 dataCache（双 L1 检查 + gzip + 逐出指标）行为差异大，共享工厂需大量参数化，低 ROI。
- **B1-2** ✅ 已执行（上轮）+ 本轮验证。新建 `infrastructure/redisGuard.ts`（silentRedis/scanDelKeys，+12，独立模块避免 rbacCache 测试整模块 mock redisClient 冲突）；rbacCache 4 守护操作、dataCache writeCache/scanDel/deletePriceCache、backtestResultUtils set/get/clear 全改 silentRedis/scanDelKeys。净 **−96**（redisGuard +12、rbacCache −66、dataCache −28、backtestResultUtils −14）；rbacCache/data-cache-service/backtest-result-cache 3 文件 37 测试绿 + `pnpm check` 4/4。
- **B1-3** ✅ 已执行。goDataServiceClient 新增 `fetchGoJson`（JSON.parse + {success,data} 信封；HTTP 层仍由 callGoDataService 抛，容错留在调用方）；dataServices.fetchCpiFromGo + dataQuery fetchMissingFromGoService/searchTickers 3 调用点改用，dataServices 不再直接依赖 callGoDataService。净 **−2**（src −8：goDataServiceClient +6、dataServices −8、dataQuery −6 仅本会话 3 处；dataService.shared mock +6）；ticker-data-service/data-service/data-query-service 144 测试绿。audit 估 15 高估——try/catch 与 warn 语义各调用点异构，helper 只收敛信封解析。
- **B1-4** ⛔ 延后。/errors switch 各 case payload 形状异构（vital/apiTiming/componentRender/pageTiming/navigation）+ per-case 条件，表驱动只是搬迁闭包，无净减。
- **B1-5** ✅ 已执行。新建 `utils/ttlCache.ts` 共享 keyed createTtlCache（get 过期自动清理 + clear）；dataRoutes（内联 13 行函数删）、platformRoutes（手写单槽 {data,expiry} 缓存→keyed，POST 失效改 clear()）、marketStats（TtlCacheEntry+makeTtlCache 20 行删，3 实例 key 化，getLastUpdated `!== null`→`!== undefined` 语义等价）三处收敛。净 **−30**（ttlCache +12、marketStats −28、dataRoutes −15、platformRoutes +1）；market-stats/data-routes/health-routes 等 7 文件 230 测试绿。audit 估 12 高估——marketing 真实受益方是第 3 个实现 marketStats.makeTtlCache。
- **B1-6** ⛔ 延后。3 个 timedCompute 注册各带异构 startLog/fn 闭包，表 + register 助手每项配置 ~10 行 ≈ 原内联 11 行，净负。
- **B1-7** ⛔ 延后。5 处事务语义异构（catch 内 sendProblem、事务中 ROLLBACK+return、COMMIT 后 NOTIFY），pool 已有 withTenantContext，withTransaction 参数化 ROI 低。
- **B1-8** ✅ 已执行。orgRoutes PATCH/DELETE member 共享 `sendMemberOutcome`（'not_found'/'last_owner'/ok 结果分发，两 service 返回同一 union）。净 **−12**（orgRoutes −12）；org-routes 8 + persistence-routes 45 + orgs.integration 编译绿。
- **B1-9** ⛔ 延后。backtest /runs/:jobId 与 jobRoutes 响应形状不同（jobId/status/progress + timestamp/finishedOn vs id/type/state/createdAt）+ jobAccessGranted 分支，仅共享 mapJobState 已覆盖。

### B2 前端脏文件（14 项，≈145）— 全部处置（7 执行 + 4 前序 + 3 延后）

- **B2-1** ⛔ 延后。ParamGroup（button + 旋转 chevron + badge + hover）vs ParamsSection（div role=button + 键盘 + info tooltip + plain）交互/DOM 模型异构，合并需双向分支 ≈ 收益，8 处消费方行为风险 > ~20 行净省。
- **B2-2** ✅ 已执行。tables.tsx 三合一：内部 `BaseTable`（统一 TableColumn：key/label/align/render/sortValue/style + nowrap/rowKey/maxWidth/sticky 可调）+ `SimpleTable`/`SortableTable` 薄包装（public API 不变，`SimpleTableColumn`/`Column` 变 type alias）。净 **−31**（cumulative numstat 98/92 含前序会话 44；本会话 171→140）。
- **B2-3** ✅ 已执行（前序图表替换 + 本轮修复）。GoalOptimizerResults 两图表换 ChartXAxis/ChartTooltip；本轮修 ChartXAxis tickFormatter 类型（`(v: number|string)` → Number() 强转，2 处）。相关 3 文件 55 测试绿。
- **B2-4** ✅ 已执行。PCAPage numComponents 手写 div+span 后缀 → `AffixInput suffix`（16→3）。净 **−13**（cumulative 30/57 含前序）。
- **B2-5** ✅ 已执行。GoalOptimizerParams years 后缀 → `AffixInput suffix`（13→1）。净 **−12**（cumulative 47/136 含前序）。
- **B2-6** ⛔ 延后。StatCard（p-5 + trend 图标）vs KpiCard（CardHeader + 彩色 icon 盒 + color 类）视觉异构，合并净省 ~5 且改 4 处 admin 页外观。
- **B2-7** ⛔ 延后。benchmark switch 特殊映射（`v ? 'SPY' : ''`）+ TickerInput 子内容使数组化每项净 ~4 行，ROI 低。
- **B2-8** ✅ 已执行。McErrorState/McEmptyState 内联进 MonteCarloResultsPanel（`{ t }` + 两个条件早返回）。净 **−2**。
- **B2-9** ✅ 已执行。OptimizerResults ConstraintsSummary `show: true` ×5 → `show?: boolean`（省略即显示）+ filter `!== false`。净 **−5**。
- **B2-10** ✅ 已执行。TabFallback 上移 `components/shells/index.tsx`（+12/−5），AnalysisResults + MonteCarloResults 共用（各删本地副本 + Loader2 import）。净 **−5**（3 文件）。
- **B2-11** ✅ 已执行（前序）。ChartCard no-title 条件 header。
- **B2-12/13/14** ✅ 已执行（前序）。identityLabelFormatter/binLabel/TICK_STYLE 收敛，chart-theme 55 测试绿。
- 验证：`pnpm check` 4/4 + `tests/unit` 2464 passed/5 skipped + `tests/contract` 17 passed。

### B3 测试脏文件（6 项，≈134）— 部分执行

- **B3-1** ⛔ 延后。A8 已吸收主体（22 块迁移 withServer），剩余 per-it server 块（persistence-routes 3、data-manage-routes 3）因各测试 role/mock 不同低 ROI，保留。
- **B3-2** ✅ 已执行。两文件本地重复统计块（cagr 0.1/stdev 0.15/sharpe 1.5/sortino 1.8/maxDrawdown 0.15/totalReturn 0.2，断言依赖：payload.totalReturn 0.2/maxDrawdown 0.15/sharpeRatio 1.5）→ storeFixtures 新增共享 `mockBacktestStats`（+21）+ 本地 const 改 `mockBacktestResultFixture({ portfolios: [mockPortfolioResult({..., statistics: mockBacktestStats})] })`（工厂别名避名冲突）。净 **−25**（numstat：backtest-service 10/22、backtest-portfolio-service 11/24、storeFixtures 21/1）；未动 storeFixtures 默认统计（改默认会破坏 backtest-store.results.test.ts:287 sortino 0.6 等消费者）。相关 8 文件 164 测试绿。
- **B3-3** ✅ 已执行。experiment-3 手动 lifecycle（beforeAll/afterAll + let fixture + recover 分支）→ `setupChaosLifecycle(CONTAINERS.api, 自定义 recoverFn)`。净 **−20**（numstat 7/27）；chaos 5 文件 vitest 编译绿（7 skipped，docker 未开）。
- **B3-4** ⛔ 延后。3 处 config vi.mock 近似但 extras 各异（health 有 PLAN_LIMIT_FLAGS、analysis 有 SYNC_COMPUTE_TIMEOUT_MS: 500），抽 createConfigModuleMock 参数化后 prettier 展开净收益 ∈ {−2, +1}，低 ROI。
- **B3-5** ⛔ 延后。analysisRoutes mock 块含 shared 没有的 SYNC_COMPUTE_TIMEOUT_MS env + sanitizeLog + metrics importOriginal mock，并入 backtestRoutes.shared.ts 需参数化 + importOriginal 化，行为风险 > ~8 行收益。
- **B3-6** ⛔ 未做。expectOk 路由断言 helper（65×status+13×success）——审计低估真实重复密度（各断言场景 status/success 语义不同），表驱化收益有限。

### B4 工具家族 X（≈78）— 部分执行

- **B4-1** ✅ 已执行。`utils/constants.ts` 新增共享 `buildSinglePortfolioBody(name, assets, {rebalanceFrequency, rebalanceOffset, id}, parameters)`（+21）；EfficientFrontierUtils 两处（buildPortfolioData/fetchCorrelations）+ rebalancingSensitivityBuilders buildBacktestBody 改用。净 **−35**（constants +32/−1、EfficientFrontierUtils 49/80 含前序、rebalancingSensitivityBuilders 11/24 含前序）。
- **B4-2** ⛔ 延后。SignalHistoryTable 自定义表头（无 uppercase、`border-strong`、py-2、`bg-input-bg/40` 斑马、`text-label` 单元格）与 SimpleTable 样式系统不兼容；强转需改外观（uppercase 表头等），违反外观约束。若未来允许外观漂移可做。

### B5 Go 脏/次阈值（5 项，≈39）— 全部处置（4 执行 + 1 已存在）

- **B5-1** ✅ 已存在。4 个 provider（akshare/yfinance/finnhub/twelvedata）已是包级 `var base = provider.NewBaseProvider(...)`，init() 包装仅剩 cmd/worker/main.go 无关项，无需改动。
- **B5-2** ✅ 已执行。montecarlo calcPathMetrics + goaloptimizer 两处 `mathutil.Std(dailyRets) * math.Sqrt(N)` → `engine.CalcAnnualizedStdev`（已含 len<2 守卫）；goaloptimizer 补 engine import（无环）。净 **−6**（montecarlo 12/22 含前序、goaloptimizer 2/4）。
- **B5-3** ✅ 已执行。calcUlcerDuring 19 行 → 提取窗口 values 后委托 `CalcUlcerIndex`（9 行，语义等价：窗口起点为真实峰值，运行峰值==固定峰值；drawdown 测试 9 断言绿）。净 **−9**（drawdownEpisodes 3/12）。
- **B5-4** ✅ 已执行。assertFloat 3 行包装删，drawdown_test.go 9 处 `assertFloat(t,...)` → `assertFloatApprox(t,...,1e-6)`。净 **−3**（本会话；drawdown_test 63/72 含前序 126）。
- **B5-5** ✅ 已执行。engineutil 新增 `DefaultStartingValue(v)`（+8）；engine/backtest.go 2 处、analysis.go 1 处、montecarlo.go 1 处（改无条件赋值）。净 **−10**（analysis 1/4、backtest 2/8、engineutil 10/13 含前序）。
- 验证：`go test ./...` engine-go 全绿（drawdown/statistics/montecarlo/goaloptimizer/analysis 含 0 失败）；data-fetcher `go test ./...` 无 FAIL。

---

## C. 非代码（≈295）— 全部完成

- **C-1** ✅ 已执行。删 12 行 "what" 注释（BacktestPage.tsx:78、dataServices.ts ×2、usageService.ts:54、jwtAuth.ts:133、marketStatsHelpers.ts ×2、chaos experiment-1/2/4 ×3、contract:79、handlers.go:69）。handlers.go 连带合并被注释拆开的行 + gofmt；contract:79 同时并相邻行。净 **−12**（git numstat 分散在 9 文件，注释行 12；handlers −1、contract −3、BacktestPage −1、chaos ×3 各含断言/Step 注释）。
- **C-2** ✅ 已执行。删 ARCHITECTURE.md:104 坏链（`./capacity-planning.md` 不存在）、ops-guide.md 重复指引 blockquote + Git 工作流小节、data-governance.md ADR-038/dr-runbook 引用改直述（+1/−1 等长）；docs/research/ 空目录删除。净 **−9**（git numstat：ARCHITECTURE 0/2、ops-guide 0/7、data-governance 1/1）。
- **C-3** ✅ 已执行。删 6 个空 namespace JSON（account/admin/analysis/auth/legal/pages 各 `{}`）+ index.ts NS 数组 10 行→1 行。净 **−15**（6×1 + index 1/10）。verify-i18n.mjs 不改（删空 ns 不影响校验）。
- **C-4** ✅ 已执行。git numstat **−371**：package.json 17 个零引用脚本 −17（dev:stop 保留因 dev.mjs:266 引用）、.gitignore 过期条目 −22、.dockerignore −4、.editorconfig −12（删 rs/py 段）、components.json 整删 −19（零引用，tailwind 配置实为 tailwind.config.cjs）、postcss.config.js 整删 −10（vite.config.ts:309 内联配置）、check-input-widths.mjs −100、generate-openapi.ts −186（两脚本随脚本删除连带）、vite.config.ts −1。knip.json 删 postcss.config.js/tailwind.config.js ignore 条目（前 commit 已落）；turbo.json 未动（避免破坏 CI）。audit 估 51 严重低估——只算了脚本名行，未算脚本文件本体。
- **C-5** ✅ 已执行。删未跟踪 `temp_modified.txt`（213 行，磁盘口径；不进 git）。
- 注：`scripts/verify-i18n.mjs`、`i18n-to-inline.mjs` 引用已删的 `en/` locale（坏引用，随 A10 一起处理，A10 已删 i18n-to-inline.mjs）。

---

## 执行顺序

1. **A 区优先**（立即执行，验证全绿）：A1 前端图表族 → A2 工具家族 → A5/A6 Go → A7/A8 测试 → A3/A4 前端 params → A9 后端 → A10 脚本。
2. **B 区**待 dirty refactor 落地后按 B3 → B1 → B2 → B4 → B5 执行。
3. **C 区**随时可做（C-5 立即）。
4. 每文件修改后 `pnpm exec prettier --write`（TS/JS）/ `gofmt -w`（Go）；相关 `pnpm exec vitest run <测试>` + `pnpm exec tsc --noEmit` + `go test ./...`；最后全量 `pnpm exec vitest run tests/unit`。
