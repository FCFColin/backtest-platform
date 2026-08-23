# count-loc.ps1 — scc 行数统计
# 基线 89,355 行（2026-08-23 首轮压缩收口，原基线 179,541 已达成 -50.2%）；目标 <= 100,000 行（AGENTS.md）

$root = Split-Path -Parent $PSScriptRoot
$baseline = 89355
$target = 100000
$exclude = 'node_modules,dist,dist-ssr,.dev-logs,coverage,.git,data,report,.turbo,.cache,.vite,playwright-report,test-results,docs/audit,.github,.husky,.devcontainer,docker,config,k8s'

$result = scc $root --exclude-dir $exclude --no-cocomo --sort lines --format json | ConvertFrom-Json

$total = ($result | Measure-Object -Property Lines -Sum).Sum
$cut = $baseline - $total
$pct = [math]::Round(($cut / $baseline) * 100, 1)

Write-Host "=== 按语言行数 ==="
$result | Sort-Object Lines -Descending | ForEach-Object {
  '{0,-20} {1,8} lines  ({2,6} code  {3,5} blank  {4,5} comment)' -f $_.Name, $_.Lines, $_.Code, $_.Blank, $_.Comment
}
Write-Host ''
Write-Host ('=== 全仓库合计: {0} lines in {1} files ===' -f $total, ($result | Measure-Object -Property Count -Sum).Sum)
Write-Host ('=== vs 基线 {0}: net -{1} (-{2}%) ===' -f $baseline, $cut, $pct)
Write-Host ('=== 距目标 {0} (<=100k): 需再减 {1} 行 ===' -f $target, ($total - $target))
if ($total -gt $target) {
  Write-Host 'FAIL: 超出 100k 行硬指标（AGENTS.md），须先等价削减再收尾' -ForegroundColor Red
  exit 1
}

Write-Host "`n=== Top 30 largest files ==="
$files = scc $root --exclude-dir $exclude --no-cocomo --by-file --sort lines --format json 2>$null | ConvertFrom-Json
$files | ForEach-Object { $_.Files } | Sort-Object Lines -Descending | Select-Object -First 30 | ForEach-Object {
  '{0,7} lines  {1}' -f $_.Lines, $_.Filename
}