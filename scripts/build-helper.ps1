# Card 26: bundles the Halo helper into one exe (PyInstaller) and puts it where Tauri looks for a sidecar:
#   desktop/src-tauri/binaries/halo-helper-x86_64-pc-windows-msvc.exe
# The app starts and stops it. Run by `npm run helper:build`, and by `npm run desktop:build` before the installer.
# It builds in helper/.build-venv (made on first run), so it never touches the old helper's venv.
param([switch]$Force)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$helper = Join-Path $root 'helper'
$out = Join-Path $root 'desktop/src-tauri/binaries'
$target = Join-Path $out 'halo-helper-x86_64-pc-windows-msvc.exe'
$sources = Get-ChildItem $helper -Filter '*.py' | Where-Object { $_.Name -in 'halo_helper.py', 'halo_extras.py', 'halo_fast.py' }
if (-not $Force -and (Test-Path $target) -and (-not ($sources | Where-Object { $_.LastWriteTime -gt (Get-Item $target).LastWriteTime }))) {
  Write-Host "helper exe is up to date: $target"; exit 0
}
$venv = Join-Path $helper '.build-venv'
$py = Join-Path $venv 'Scripts/python.exe'
if (-not (Test-Path $py)) {
  $base = (Get-Command py -ErrorAction SilentlyContinue)
  if ($base) { & py -3.12 -m venv $venv } else { & python -m venv $venv }
}
& $py -m pip install -q -r (Join-Path $helper 'requirements.txt') pyinstaller
New-Item -ItemType Directory -Force $out | Out-Null
$work = Join-Path $helper 'build'
& $py -m PyInstaller --noconfirm --clean --onefile --noconsole --name halo-helper `
  --distpath (Join-Path $helper 'dist') --workpath $work --specpath $work `
  --paths $helper --collect-submodules uvicorn --collect-submodules pycaw --hidden-import comtypes.stream --hidden-import win32com.client --hidden-import pythoncom --hidden-import halo_fast `
  --exclude-module tkinter --exclude-module pytest `
  (Join-Path $helper 'halo_helper.py')
if ($LASTEXITCODE -ne 0) { throw 'PyInstaller failed' }
Copy-Item (Join-Path $helper 'dist/halo-helper.exe') $target -Force
Write-Host ("built {0} ({1:N1} MB)" -f $target, ((Get-Item $target).Length / 1MB))
