param([int]$Port = 8001)

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PidFile = Join-Path $ProjectRoot "backend.pid"
$LogFile = Join-Path $ProjectRoot "backend.log"
$OutLog = Join-Path $ProjectRoot "backend.out.log"
$ErrLog = Join-Path $ProjectRoot "backend.err.log"

if (Test-Path $PidFile) {
    $oldPid = Get-Content $PidFile -ErrorAction SilentlyContinue
    if ($oldPid) {
        $proc = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "Backend is already running (PID: $oldPid)"
            exit 0
        }
    }
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
}

$python = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    $python = Get-Command python.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
    if (-not $python) {
        Write-Error "python.exe not found"
        exit 1
    }
}

Write-Host "Starting backend on port $Port ..."

$env:PYTHONUTF8 = "1"

$proc = Start-Process -FilePath $python `
    -ArgumentList "-m", "uvicorn", "api:app", "--host", "127.0.0.1", "--port", "$Port" `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $OutLog `
    -RedirectStandardError $ErrLog `
    -PassThru

$proc.Id | Out-File -FilePath $PidFile -Encoding utf8

$started = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
"$started PID=$($proc.Id) Port=$Port" | Out-File -FilePath $LogFile -Encoding utf8

Write-Host "Backend started: http://localhost:$Port (PID: $($proc.Id))"
