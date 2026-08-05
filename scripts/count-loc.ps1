# count-loc.ps1 — scc 行数统计（对齐 structural-slim-down 计划）
#
# 基线 179,541 行：瘦身前 commit c10bc33（df4d779 父提交）全仓库统一口径实测
# 目标：<= 89,770 行（-50%）/ 125,678 行（-30%）。

$root = 'd:\Project\回测平台'
$baseline = 179541
$target50 = 89770
$target30 = [math]::Floor($baseline * 0.70)
$exclude = 'node_modules,dist,dist-ssr,.dev-logs,coverage,.git,data,report,.nyc_output,.turbo,.cache,.vite,playwright-report,test-results'

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
Write-Host ('=== 距 -30% ({0}): 需再减 {1} 行 | 距 -50% ({2}): 需再减 {3} 行 ===' -f `
  $target30, ($total - $target30), $target50, ($total - $target50))

Write-Host "`n=== Top 30 largest files ==="
$files = scc $root --exclude-dir $exclude --no-cocomo --by-file --sort lines --format json 2>$null | ConvertFrom-Json
$files | ForEach-Object { $_.Files } | Sort-Object Lines -Descending | Select-Object -First 30 | ForEach-Object {
  '{0,7} lines  {1}' -f $_.Lines, $_.Filename
}