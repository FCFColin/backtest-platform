# Run E2E tests locally
# Usage: .\scripts\run-e2e.ps1 [-Headed]

param([switch]$Headed)

$ErrorActionPreference = "Stop"

# Check if dev server is running
$serverRunning = $false
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5176" -TimeoutSec 3 -UseBasicParsing
    $serverRunning = $true
} catch {}

if (-not $serverRunning) {
    Write-Host "Starting dev server..." -ForegroundColor Yellow
    Start-Process -FilePath "npm" -ArgumentList "run", "dev" -NoNewWindow:$false
    Write-Host "Waiting for dev server..." -ForegroundColor Yellow
    $maxWait = 60
    $waited = 0
    while ($waited -lt $maxWait) {
        try {
            Invoke-WebRequest -Uri "http://localhost:5176" -TimeoutSec 2 -UseBasicParsing | Out-Null
            break
        } catch {
            Start-Sleep -Seconds 2
            $waited += 2
        }
    }
    if ($waited -ge $maxWait) {
        Write-Host "Dev server failed to start" -ForegroundColor Red
        exit 1
    }
}

Write-Host "Running E2E tests..." -ForegroundColor Green
if ($Headed) {
    npx playwright test --headed
} else {
    npx playwright test
}
