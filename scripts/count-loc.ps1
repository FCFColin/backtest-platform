# count-loc.ps1 — 全文件口径行数统计（对齐 structural-slim-down 计划）
#
# 口径（2026-07-31 复现验证）：
#   - 统计仓库内所有文本文件（.ts/.tsx/.go/.md/.yaml/.json/.css/.mjs/.sh/.ps1/.sql 等）
#   - 物理行数（含空行），逐文件 Measure-Object -Line 累加
#   - 排除目录：node_modules / dist / .cache / coverage / .git / \data\（数据文件）/ .trae（计划辅助文档）
#   - 排除二进制与产物扩展名（见 $binaryExts）
#
# 基线 179,541 行：瘦身前 commit c10bc33（df4d779 父提交）全仓库统一口径实测
# （git archive 复现 + 同口径统计；原 141,714 与任何实测时点不符，已废弃）。
# 目标：<= 89,770 行（-50%）/ 125,678 行（-30%）。

$root = 'd:\Project\回测平台'
$baseline = 179541
$target50 = 89770
$target30 = [math]::Floor($baseline * 0.70)

$excludeDir = '\\node_modules\\|\\dist\\|\\dist-ssr\\|\\\.cache\\|\\coverage\\|\\\.git\\|\\data\\|\\.dev-logs\\|\\.vite\\|\\.trae\\'
$binaryExts = @(
  '.exe', '.dll', '.so', '.dylib', '.gz', '.zip', '.tar', '.7z', '.rar',
  '.csv', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2',
  '.ttf', '.eot', '.map', '.lockb', '.wasm', '.db', '.sqlite', '.bin', '.pdf',
  '.parquet', '.class', '.jar'
)

function Count-Lines($path) {
  $total = 0
  $files = Get-ChildItem -Path $path -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object {
      $_.FullName -notmatch $excludeDir -and $_.Name -ne 'pnpm-lock.yaml' -and $_.Extension.ToLower() -notin $binaryExts
    }
  foreach ($f in $files) {
    $total += (Get-Content $f.FullName -ErrorAction SilentlyContinue | Measure-Object -Line).Lines
  }
  return @{ Total = $total; Files = $files.Count }
}

$layers = @(
  @{ Name = 'Frontend';     Dir = 'packages\frontend\src' },
  @{ Name = 'Backend';      Dir = 'packages\backend\src' },
  @{ Name = 'Engine-Go';    Dir = 'engine-go' },
  @{ Name = 'Data-Fetcher'; Dir = 'data-fetcher' },
  @{ Name = 'Tests';        Dir = 'tests' },
  @{ Name = 'Docs';         Dir = 'docs' },
  @{ Name = 'Misc';         Dir = 'packages\shared,scripts,go-shared' }
)

Write-Host "=== 按层行数（all-file 口径） ==="
$layerTotal = 0
foreach ($l in $layers) {
  $sum = 0
  foreach ($d in ($l.Dir -split ',')) {
    $r = Count-Lines (Join-Path $root $d)
    $sum += $r.Total
  }
  $layerTotal += $sum
  '{0,-14} {1,8} lines' -f $l.Name, $sum
}

$whole = Count-Lines $root
$cut = $baseline - $whole.Total
$pct = [math]::Round(($cut / $baseline) * 100, 1)

Write-Host ''
Write-Host "=== 计划七层合计: $layerTotal lines ==="
Write-Host ('=== 全仓库合计: {0} lines in {1} files ===' -f $whole.Total, $whole.Files)
Write-Host ('=== vs 基线 {0}: net -{1} (-{2}%) ===' -f $baseline, $cut, $pct)
Write-Host ('=== 距 -30% ({0}): 需再减 {1} 行 | 距 -50% ({2}): 需再减 {3} 行 ===' -f `
  $target30, ($whole.Total - $target30), $target50, ($whole.Total - $target50))

Write-Host "`n=== Top 30 largest files ==="
Get-ChildItem -Path $root -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch $excludeDir -and $_.Extension.ToLower() -notin $binaryExts } |
  ForEach-Object {
    $lc = (Get-Content $_.FullName -ErrorAction SilentlyContinue | Measure-Object -Line).Lines
    [PSCustomObject]@{ Lines = $lc; Path = $_.FullName.Replace($root + '\', '') }
  } |
  Sort-Object Lines -Descending |
  Select-Object -First 30 |
  Format-Table -AutoSize

Write-Host "`n=== File counts per top-level dir ==="
Get-ChildItem -Path $root -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch $excludeDir -and $_.Extension.ToLower() -notin $binaryExts } |
  ForEach-Object {
    $rel = $_.FullName.Replace($root + '\', '')
    $top = ($rel -split '\\')[0]
    [PSCustomObject]@{ TopDir = $top }
  } |
  Group-Object TopDir |
  ForEach-Object { [PSCustomObject]@{ TopDir = $_.Name; Files = $_.Count } } |
  Sort-Object Files -Descending |
  Format-Table -AutoSize
