<#
.SYNOPSIS
  删除冗余注释（解释 WHAT 的注释），保留解释 WHY 的注释。
  规则来自 code-cleanup 任务定义。
  兼容 Windows PowerShell 5.1。
#>

[CmdletBinding()]
param(
    [string[]]$Paths,
    [string]$ListFile,
    [switch]$DryRun,
    [switch]$VerboseReport
)

$ErrorActionPreference = 'Stop'

# ---- 解析目标文件列表 ----
$targetPaths = [System.Collections.Generic.List[string]]::new()
if ($Paths) {
    foreach ($p in $Paths) {
        # 支持换行/逗号分隔的多路径传入
        foreach ($split in ($p -split "[`r`n,]")) {
            $t = $split.Trim()
            if ($t) { $targetPaths.Add($t) }
        }
    }
}
if ($ListFile) {
    foreach ($line in (Get-Content $ListFile)) {
        $t = $line.Trim()
        if ($t -and -not $t.StartsWith('#')) { $targetPaths.Add($t) }
    }
}
if ($targetPaths.Count -eq 0) {
    Write-Error "No target paths. Use -Paths or -ListFile."
    exit 1
}

# ---- 单行注释判定 ----
function Test-SeparatorLine {
    param([string]$line)
    # 纯分隔注释：// ===== xxx ===== / // ------ / // ****** xxx ******
    if ($line -match '^\s*//\s*[-=*]{3,}.*[-=*]{3,}\s*$') { return $true }
    if ($line -match '^\s*//\s*[-=*]{5,}\s*$') { return $true }
    return $false
}

function Test-HistoricalMergeComment {
    param([string]$line)
    if ($line -match '^\s*//') {
        if ($line -match '合并自|merged from|split from|提取自|搬移自|移自|拆分自') { return $true }
    }
    return $false
}

function Test-SectionDivider {
    param([string]$line)
    # // ----- xxx ----- / // ===== xxx ===== （居中型分隔，至少两侧各有 2 个相同字符）
    if ($line -match '^\s*//\s*-{2,}\s+\S.*\S\s+-{2,}\s*$') { return $true }
    if ($line -match '^\s*//\s*={2,}\s+\S.*\S\s+={2,}\s*$') { return $true }
    if ($line -match '^\s*//\s*~{2,}\s+\S.*\S\s+~{2,}\s*$') { return $true }
    return $false
}

function Test-ObsoleteTodo {
    param([string]$line)
    if ($line -match '^\s*//\s*TODO') { return $true }
    if ($line -match '^\s*//\s*FIXME') { return $true }
    if ($line -match '^\s*//\s*HACK') { return $true }
    if ($line -match '^\s*//\s*XXX') { return $true }
    return $false
}

# 功能性注释必须保留
function Test-FunctionalComment {
    param([string]$line)
    if ($line -match 'eslint-disable') { return $true }
    if ($line -match '@ts-expect-error') { return $true }
    if ($line -match '@ts-ignore') { return $true }
    if ($line -match '@ts-nocheck') { return $true }
    if ($line -match 'eslint-disable-next-line') { return $true }
    if ($line -match 'prettier-ignore') { return $true }
    if ($line -match '@vite-ignore') { return $true }
    return $false
}

function Test-WhyComment {
    param([string]$line)
    # 解释 WHY 的注释：包含这些关键词的整行注释保留
    if ($line -match '^\s*//') {
        if ($line -match 'workaround|hack|WARNING|注意|警告|不能|必须|避免|防止|原因|因为|由于|为了|以防|务必|切勿|不要') {
            return $true
        }
        # 引用 ADR / P0-0x / RFC 等
        if ($line -match 'ADR-\d+|P0-\d+|RFC\s?\d+|RFC\s?\d+') { return $true }
    }
    return $false
}

# 判定 JSDoc 块内容是否为可移除的"描述性"块（无功能性标签、非 WHY）
function Test-JSDocBlockRemovable {
    param([string]$blockText)
    # 含功能性标签 → 保留
    if ($blockText -match '@param|@returns|@throws|@deprecated|@see|@example|@internal|@public|@private') { return $false }
    # 含 WHY 关键词 → 保留
    if ($blockText -match 'workaround|hack|WARNING|注意|警告|不能|必须|避免|防止|原因|因为|由于|为了|以防|务必|切勿|不要') { return $false }
    if ($blockText -match 'ADR-\d+|P0-\d+|RFC\s?\d+') { return $false }
    # 含 TODO/FIXME → 保留（功能性）
    if ($blockText -match 'TODO|FIXME|HACK|XXX') { return $false }
    # 合并历史 → 可移除
    return $true
}

function Remove-RedundantComments {
    param([string]$Path, [switch]$DryRun)

    $raw = [System.IO.File]::ReadAllText($Path)
    # 统一保留原始换行
    $crlf = $raw -match "`r`n"
    $sep = if ($crlf) { "`r`n" } else { "`n" }

    $lines = $raw -split "`r?`n"
    $out = [System.Collections.Generic.List[string]]::new()
    $removedCount = 0
    $removedSamples = [System.Collections.Generic.List[string]]::new()

    # ---- 处理文件头块注释（仅移除文件最开头的 /** ... */ 描述性块，且内容仅描述文件用途/历史）----
    $startIdx = 0
    # 跳过开头的空行
    while ($startIdx -lt $lines.Count -and $lines[$startIdx].Trim() -eq '') { $startIdx++ }

    if ($startIdx -lt $lines.Count -and $lines[$startIdx].Trim() -eq '/**') {
        # 寻找结束 */
        $endIdx = -1
        for ($i = $startIdx + 1; $i -lt $lines.Count; $i++) {
            if ($lines[$i] -match '\*/\s*$') { $endIdx = $i; break }
        }
        if ($endIdx -gt 0) {
            $blockText = ($lines[$startIdx..$endIdx] -join ' ')
            # 判定是否为"描述性文件头"：包含 merged from / 合并自 / 覆盖 / 文件用途 / 详见 等字样
            $isDescriptive = $false
            if ($blockText -match '合并自|merged from|split from|提取自|搬移自|移自|拆分自') { $isDescriptive = $true }
            if ($blockText -match '覆盖[:：]|覆盖范围|详见|见\s+\w+\.test\.ts|本文件|本测试') { $isDescriptive = $true }
            # 仅当块内不包含 @param/@returns/@throws（功能性 JSDoc）时才移除
            $hasTags = $blockText -match '@param|@returns|@throws|@deprecated|@see|@example'
            if ($isDescriptive -and -not $hasTags) {
                for ($i = $startIdx; $i -le $endIdx; $i++) {
                    $removedSamples.Add("HEADER: $($lines[$i])")
                }
                $removedCount += ($endIdx - $startIdx + 1)
                # 跳过块后紧跟的空行
                $startIdx = $endIdx + 1
                while ($startIdx -lt $lines.Count -and $lines[$startIdx].Trim() -eq '') { $startIdx++ }
            }
        }
    }

    # ---- 逐行处理（带前瞻，识别 separator/title/separator 三行块 + JSDoc 块）----
    $i = $startIdx
    while ($i -lt $lines.Count) {
        $line = $lines[$i]

        if (Test-FunctionalComment $line) { $out.Add($line); $i++; continue }
        if (Test-WhyComment $line) { $out.Add($line); $i++; continue }

        # JSDoc 块检测：单行 /** ... */ 或多行 /** ... */
        $trimmed = $line.Trim()
        if ($trimmed.StartsWith('/**')) {
            # 单行 JSDoc：/** xxx */ 同一行结束
            if ($trimmed -match '\*/\s*$') {
                $blockText = $trimmed
                if (Test-JSDocBlockRemovable $blockText) {
                    $removedSamples.Add("JSDoc1: $line")
                    $removedCount++
                    $i++
                    continue
                }
                $out.Add($line)
                $i++
                continue
            }
            # 多行 JSDoc：寻找结束 */
            $endJ = -1
            for ($j = $i + 1; $j -lt $lines.Count; $j++) {
                if ($lines[$j] -match '\*/\s*$') { $endJ = $j; break }
            }
            if ($endJ -gt 0) {
                $blockText = ($lines[$i..$endJ] -join ' ')
                if (Test-JSDocBlockRemovable $blockText) {
                    for ($k = $i; $k -le $endJ; $k++) { $removedSamples.Add("JSDoc: $($lines[$k])") }
                    $removedCount += ($endJ - $i + 1)
                    $i = $endJ + 1
                    continue
                }
                # 不可移除：保留整个块
                for ($k = $i; $k -le $endJ; $k++) { $out.Add($lines[$k]) }
                $i = $endJ + 1
                continue
            }
        }

        # 非块式单行 /* ... */ 描述性注释（非 JSDoc，即不以 /** 开头）
        if ($trimmed -match '^/\*[^*].*\*/\s*$' -and $trimmed -notmatch '@') {
            if ($trimmed -notmatch 'workaround|hack|WARNING|注意|警告|不能|必须|避免|防止|原因|因为|由于|为了|以防|务必|切勿|不要|ADR-\d+|P0-\d+') {
                $removedSamples.Add("INLINE-BLOCK: $line")
                $removedCount++
                $i++
                continue
            }
        }

        if (Test-SeparatorLine $line) {
            # 前瞻：separator / 注释标题 / separator 三行块一并移除
            $isTriplet = $false
            if ($i + 2 -lt $lines.Count) {
                $next1 = $lines[$i + 1]
                $next2 = $lines[$i + 2]
                $next1IsTitle = $next1 -match '^\s*//\s*\S' -and -not (Test-SeparatorLine $next1) -and -not (Test-FunctionalComment $next1) -and -not (Test-WhyComment $next1)
                if ($next1IsTitle -and (Test-SeparatorLine $next2)) {
                    $removedSamples.Add($line)
                    $removedSamples.Add($next1)
                    $removedSamples.Add($next2)
                    $removedCount += 3
                    $isTriplet = $true
                    $i += 3
                }
            }
            if ($isTriplet) { continue }
            $removedCount++
            $removedSamples.Add($line)
            $i++
            continue
        }
        if (Test-HistoricalMergeComment $line) {
            $removedCount++
            $removedSamples.Add($line)
            $i++
            continue
        }
        if (Test-SectionDivider $line) {
            $removedCount++
            $removedSamples.Add($line)
            $i++
            continue
        }
        if (Test-ObsoleteTodo $line) {
            $removedCount++
            $removedSamples.Add($line)
            $i++
            continue
        }

        $out.Add($line)
        $i++
    }

    # 折叠连续空行为最多 1 个空行
    $collapsed = [System.Collections.Generic.List[string]]::new()
    $prevBlank = $false
    foreach ($l in $out) {
        $isBlank = ($l.Trim() -eq '')
        if ($isBlank -and $prevBlank) { continue }
        $collapsed.Add($l)
        $prevBlank = $isBlank
    }
    # 去掉末尾多余空行
    while ($collapsed.Count -gt 0 -and $collapsed[$collapsed.Count - 1].Trim() -eq '') {
        $collapsed.RemoveAt($collapsed.Count - 1)
    }

    $newContent = ($collapsed -join $sep) + $sep
    $origLineCount = $lines.Count
    $newLineCount = $collapsed.Count

    if (-not $DryRun) {
        $utf8 = New-Object System.Text.UTF8Encoding $false
        [System.IO.File]::WriteAllText($Path, $newContent, $utf8)
    }

    return [pscustomobject]@{
        Path           = $Path
        OriginalLines  = $origLineCount
        NewLines       = $newLineCount
        RemovedLines   = $removedCount
        NetDelta       = $origLineCount - $newLineCount
        Samples        = $removedSamples
    }
}

# ---- 主流程 ----
$results = [System.Collections.Generic.List[pscustomobject]]::new()
$totalRemoved = 0
$totalNetDelta = 0

foreach ($p in $targetPaths) {
    if (-not (Test-Path $p)) {
        Write-Warning "Skip (not found): $p"
        continue
    }
    $r = Remove-RedundantComments -Path $p -DryRun:$DryRun
    $results.Add($r)
    $totalRemoved += $r.RemovedLines
    $totalNetDelta += $r.NetDelta
    if ($VerboseReport) {
        Write-Host ("[{0}] removed={1} net={2}" -f $p, $r.RemovedLines, $r.NetDelta)
        foreach ($s in $r.Samples) { Write-Host "    $s" }
    } else {
        Write-Host ("[{0}] removed={1} net={2}" -f $p, $r.RemovedLines, $r.NetDelta)
    }
}

Write-Host ""
Write-Host ("Total comment lines removed: {0}" -f $totalRemoved)
Write-Host ("Total net line delta:        {0}" -f $totalNetDelta)

$results | Export-Csv -Path "d:\Project\回测平台\scripts\strip-comments-report.csv" -NoTypeInformation -Encoding UTF8
Write-Host "Report saved: scripts\strip-comments-report.csv"
