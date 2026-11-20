# Removes the Halo helper's start-at-logon task and stops it. Leaves the venv and token alone.
$ErrorActionPreference = 'Stop'
$taskName = 'HaloHelper'

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Removed task '$taskName'." -ForegroundColor Green
} else {
    Write-Host "No task called '$taskName' found."
}

# Stop any helper still running from this folder
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Get-CimInstance Win32_Process -Filter "Name = 'pythonw.exe'" |
    Where-Object { $_.CommandLine -like "*$here*halo_helper.py*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Write-Host 'To delete the token too: Remove-Item -Recurse "$env:APPDATA\HaloHelper"'
