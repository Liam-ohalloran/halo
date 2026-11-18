# Installs the Halo helper: venv, packages, a start-at-logon task, and starts it now.
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File helper\install.ps1
$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$venv = Join-Path $here '.venv'
$taskName = 'HaloHelper'

Write-Host 'Halo helper install' -ForegroundColor Yellow

# 1. Python 3.12 venv
if (-not (Test-Path (Join-Path $venv 'Scripts\python.exe'))) {
    Write-Host 'Creating Python 3.12 venv...'
    & py -3.12 -m venv $venv
    if ($LASTEXITCODE -ne 0) { throw 'Python 3.12 not found. Install it from python.org, then run this again.' }
}

# 2. Requirements
Write-Host 'Installing requirements...'
& (Join-Path $venv 'Scripts\python.exe') -m pip install --quiet --upgrade pip
& (Join-Path $venv 'Scripts\python.exe') -m pip install --quiet -r (Join-Path $here 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'pip install failed.' }

# 3. Scheduled task at logon (pythonw = no console window)
$pythonw = Join-Path $venv 'Scripts\pythonw.exe'
$script = Join-Path $here 'halo_helper.py'
$action = New-ScheduledTaskAction -Execute $pythonw -Argument "`"$script`"" -WorkingDirectory $here
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings `
    -Principal $principal -Description 'Halo helper (laptop bridge for Halo)' -Force | Out-Null
Write-Host "Registered task '$taskName' to start at logon."

# 4. Start it now
Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 3

$tokenFile = Join-Path $env:APPDATA 'HaloHelper\token.txt'
if (Test-Path $tokenFile) {
    Write-Host 'Done. Halo helper is running (tray icon, bottom right).' -ForegroundColor Green
    Write-Host 'To pair: right-click the tray icon, choose "Copy pairing token", then paste it in Halo, Settings, Pair helper.'
} else {
    Write-Host 'The helper did not start. Run it by hand to see why:' -ForegroundColor Red
    Write-Host "  & `"$venv\Scripts\python.exe`" `"$script`""
}
