$root = 'd:\Project\回测平台'
$exts = @('*.ts', '*.tsx', '*.go')
$results = @()
foreach ($e in $exts) {
  $files = Get-ChildItem -Path $root -Recurse -Include $e -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch 'node_modules|dist|\.cache|coverage' }
  $sum = 0
  foreach ($f in $files) { $sum += (Get-Content $f.FullName -ErrorAction SilentlyContinue | Measure-Object -Line).Lines }
  $results += [PSCustomObject]@{ Ext = $e; Files = $files.Count; Lines = $sum }
}
$results | Format-Table -AutoSize

Write-Host "`n=== Top 30 largest source files ==="
Get-ChildItem -Path $root -Recurse -Include '*.ts','*.tsx','*.go' -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch 'node_modules|dist|\.cache|coverage' } |
  ForEach-Object { $lc = (Get-Content $_.FullName -ErrorAction SilentlyContinue | Measure-Object -Line).Lines; [PSCustomObject]@{ Lines = $lc; Path = $_.FullName.Replace($root + '\', '') } } |
  Sort-Object Lines -Descending |
  Select-Object -First 30 |
  Format-Table -AutoSize

Write-Host "`n=== File counts per top-level dir ==="
Get-ChildItem -Path $root -Recurse -Include '*.ts','*.tsx','*.go' -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch 'node_modules|dist|\.cache|coverage' } |
  ForEach-Object {
    $rel = $_.FullName.Replace($root + '\', '')
    $top = ($rel -split '\\')[0]
    [PSCustomObject]@{ TopDir = $top }
  } |
  Group-Object TopDir |
  ForEach-Object { [PSCustomObject]@{ TopDir = $_.Name; Files = $_.Count } } |
  Sort-Object Files -Descending |
  Format-Table -AutoSize
