# 生产代码 LOC 口径固化脚本（AGENTS.md §5 口径战线产物）
# 输出四层口径：全仓 / 生产域毛值 / 契约层 / 迁移 → 净生产代码（ex-契约 ex-迁移）
# 用法：powershell -NoProfile -File scripts/count-prod-loc.ps1

$ErrorActionPreference = 'Stop'
$exclude = 'node_modules,dist,.turbo,.git,coverage,dist-ssr,.dev-logs,data,report'

function Get-SccLines([string[]]$SccArgs) {
  $out = & scc --exclude-dir $exclude @SccArgs 2>$null
  foreach ($line in $out) {
    if ($line -match '^Total') {
      $nums = ($line -replace ',', '') -split '\s+' | Where-Object { $_ -match '^\d+$' }
      return [int]$nums[1]   # 列序：Files, Lines, ...
    }
  }
  return 0
}

# ① 全仓：直接复用权威口径 count-loc.ps1（与 nightly loc-stats 逐字一致，防双实现漂移）
$locOut = & powershell -NoProfile -File (Join-Path $PSScriptRoot 'count-loc.ps1')
$allLine = $locOut | Select-String -Pattern '全仓库合计' | Select-Object -First 1
$all = if ($allLine) { [int](($allLine.ToString() -replace '.*合计:\s*', '' -replace '\s.*', '') -replace ',', '') } else { 0 }

# ② 生产域毛值（含契约层；migrations 在仓库根、不在扫描面内）
$prodGross = Get-SccLines @('--include-ext=ts,tsx,go', 'packages/', 'engine-go/', 'data-fetcher/')

# ③ 契约层（Zod + OpenAPI schemas，8 文件 1,057 行锚定@cef5c228 前基线）
$contract = Get-SccLines @('--include-ext=ts', 'packages/backend/src/schemas/')

# ④ 迁移（只增不减，单列观测）
$migrations = Get-SccLines @('--include-ext=sql', 'migrations/')

$prodNet = $prodGross - $contract

Write-Output '=== 生产代码口径（count-prod-loc.ps1）==='
Write-Output ('全仓            : {0}' -f $all)
Write-Output ('生产域毛值      : {0}  (packages + engine-go + data-fetcher, 含契约层)' -f $prodGross)
Write-Output ('契约层(扣除)    : {0}  (backend/src/schemas)' -f $contract)
Write-Output ('迁移(单列观测)  : {0}  (migrations/*.sql)' -f $migrations)
Write-Output ('净生产代码      : {0}  (ex-契约 ex-迁移 · G-1 门禁口径)' -f $prodNet)
