# Card 25: drives the running Halo desktop app with the real mouse and checks what Windows sees.
# Start the app first (npm run desktop:dev), then:  powershell -File scripts/desktop-probe.ps1
# It moves the pointer, so leave the mouse alone while it runs. Saves screenshots to screenshots/card-25/.
param([string]$Out = 'screenshots/card-25')
New-Item -ItemType Directory -Force $Out | Out-Null
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public class HaloWin {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
}
'@
[HaloWin]::SetProcessDPIAware() | Out-Null
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$proc = Get-Process halo-desktop -ErrorAction SilentlyContinue
if (-not $proc) { Write-Host 'FAIL halo-desktop is not running'; exit 1 }
$h = [IntPtr]$proc.MainWindowHandle
$fails = @()
function Check($ok, $msg) { if ($ok) { Write-Host "ok   $msg" } else { Write-Host "FAIL $msg"; $script:fails += $msg } }
function Rect { $r = New-Object HaloWin+RECT; [HaloWin]::GetWindowRect($h, [ref]$r) | Out-Null; $r }
function Flags { $e = [HaloWin]::GetWindowLong($h, -20); @{ through = (($e -band 0x20) -ne 0); noactivate = (($e -band 0x08000000) -ne 0); topmost = (($e -band 8) -ne 0) } }
function MovePointer($x, $y) { [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($x, $y) }
function Shot($name) {
  $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object System.Drawing.Bitmap $b.Width, 420
  [System.Drawing.Graphics]::FromImage($bmp).CopyFromScreen(0, 0, 0, 0, $bmp.Size)
  $bmp.Save((Join-Path (Resolve-Path $Out) "$name.png")); $bmp.Dispose()
}
$scale = [System.Drawing.Graphics]::FromHwnd([IntPtr]::Zero).DpiX / 96.0
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds

MovePointer 200 700; Start-Sleep -Milliseconds 800
$r = Rect; $f = Flags
$w0 = $r.R - $r.L; $h0 = $r.B - $r.T
Write-Host "scale $scale, closed window: $w0 x $h0 at ($($r.L), $($r.T)), screen $($screen.Width) x $($screen.Height)"
Check ($f.noactivate) 'never takes focus (no activate)'
Check ($f.topmost) 'always on top'
Check ($f.through) 'click through while the pointer is away'
Check ([math]::Abs((($r.L + $r.R) / 2) - $screen.Width / 2) -le 2) 'centred on the screen'
Check ($r.T -eq 0 -or $r.T -le 12) 'at the top edge'
Check ($h0 -le 60 * $scale -and $w0 -le 460 * $scale) 'window is only as big as the closed island (at most 460 x 60 css px)'
Shot 'closed'

# A point in the window but outside the island shape (the ear margin) must still be click through.
$cx = [int](($r.L + $r.R) / 2)
MovePointer ($r.L + 2) ($r.T + 8); Start-Sleep -Milliseconds 400
Check ((Flags).through) 'the ear margin beside the island is click through'

# Hover opens
MovePointer $cx ($r.T + 10); Start-Sleep -Milliseconds 400
Check (-not (Flags).through) 'the island takes the mouse while the pointer is on it'
Start-Sleep -Milliseconds 1800
$r = Rect; $wo = $r.R - $r.L; $ho = $r.B - $r.T
Write-Host "open window: $wo x $ho"
Check ($wo -ge 600 * $scale -and $ho -ge 290 * $scale) 'hover opens the window to 600 x 290'
Check ($wo -le 700 * $scale -and $ho -le 340 * $scale) 'open window is not much bigger than the island'
Shot 'open'

# Leaving closes it again and the window shrinks back
MovePointer 200 700; Start-Sleep -Milliseconds 3200
$r = Rect
Check ((($r.R - $r.L) -le 460 * $scale) -and (($r.B - $r.T) -le 60 * $scale)) 'moving away closes it and the window shrinks back'
Check ((Flags).through) 'click through again once closed'
Shot 'closed-again'

# A full screen app on this monitor hides Halo, and closing it brings Halo back.
$vis = Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);' -Name HaloVis -Namespace Native -PassThru
$form = New-Object System.Windows.Forms.Form
$form.FormBorderStyle = 'None'; $form.StartPosition = 'Manual'; $form.Bounds = $screen; $form.BackColor = 'DarkSlateGray'
$form.Show(); $form.Activate(); [System.Windows.Forms.Application]::DoEvents()
Start-Sleep -Milliseconds 2200; [System.Windows.Forms.Application]::DoEvents()
Check (-not $vis::IsWindowVisible($h)) 'hides while a full screen app is in front'
$form.Close(); [System.Windows.Forms.Application]::DoEvents()
Start-Sleep -Milliseconds 2200
Check ($vis::IsWindowVisible($h)) 'comes back after the full screen app closes'

if ($fails.Count) { Write-Host "$($fails.Count) problem(s)"; exit 1 }
Write-Host 'desktop probe: all checks passed'
