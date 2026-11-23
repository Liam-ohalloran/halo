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
Check ($w0 -ge (600 + 2 * 24) * $scale -and $h0 -ge (290 + 24) * $scale) 'window is made once at the full open size plus the 24 px glow margin'
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
Check ($wo -eq $w0 -and $ho -eq $h0) 'hover opens the island without resizing the window'
Shot 'open'

# Leaving closes it again. The window does not change size (that was the closing glitch).
MovePointer 200 700; Start-Sleep -Milliseconds 3200
$r = Rect
Check ((($r.R - $r.L) -eq $w0) -and (($r.B - $r.T) -eq $h0)) 'moving away closes it and the window stays the same size'
Check ($r.T -le 12 -and [math]::Abs((($r.L + $r.R) / 2) - $screen.Width / 2) -le 2) 'still top centre after closing'
# Everything outside the island is click through, even the bottom of the big window.
MovePointer $cx ($r.B - 4); Start-Sleep -Milliseconds 400
Check ((Flags).through) 'the empty space under the closed island is click through'
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
