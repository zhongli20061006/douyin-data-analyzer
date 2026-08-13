param([int]$Port = 8001)

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PidFile = Join-Path $ProjectRoot "backend.pid"

$stopped = $false

$conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) {
    $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
    if ($proc) {
        Stop-Process -Id $proc.Id -Force
        Write-Host "Backend stopped (PID: $($proc.Id))"
        $stopped = $true
    }
}

if (-not $stopped -and (Test-Path $PidFile)) {
    $savedPid = Get-Content $PidFile -ErrorAction SilentlyContinue
    if ($savedPid) {
        $proc = Get-Process -Id $savedPid -ErrorAction SilentlyContinue
        if ($proc -and $proc.ProcessName -like "*python*") {
            Stop-Process -Id $savedPid -Force
            Write-Host "Backend stopped via pid file (PID: $savedPid)"
            $stopped = $true
        }
    }
}

if (-not $stopped) {
    Write-Host "Backend not running on port $Port"
}

Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
