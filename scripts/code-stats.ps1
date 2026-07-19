$fe = Get-ChildItem -Path 'd:\Project\回测平台\packages\frontend\src' -Recurse -Include '*.tsx','*.ts'
$be = Get-ChildItem -Path 'd:\Project\回测平台\packages\backend\src' -Recurse -Include '*.ts'
$sh = Get-ChildItem -Path 'd:\Project\回测平台\packages\shared' -Recurse -Include '*.ts'
$go = Get-ChildItem -Path 'd:\Project\回测平台\engine-go','d:\Project\回测平台\data-fetcher' -Recurse -Include '*.go'

$feSum = ($fe | Measure-Object Length -Sum).Sum
$beSum = ($be | Measure-Object Length -Sum).Sum
$shSum = ($sh | Measure-Object Length -Sum).Sum
$goSum = ($go | Measure-Object Length -Sum).Sum

Write-Output "Frontend: $($fe.Count) files, $([math]::Round($feSum/1024)) KB"
Write-Output "Backend:  $($be.Count) files, $([math]::Round($beSum/1024)) KB"
Write-Output "Shared:   $($sh.Count) files, $([math]::Round($shSum/1024)) KB"
Write-Output "Go:       $($go.Count) files, $([math]::Round($goSum/1024)) KB"
Write-Output "Total TS/TSX: $($fe.Count + $be.Count + $sh.Count) files, $([math]::Round(($feSum+$beSum+$shSum)/1024)) KB"
