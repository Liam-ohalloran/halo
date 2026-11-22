# Card 25: counts how often the Halo window is moved or resized, by sampling its rectangle every few milliseconds.
#   powershell -File scripts/window-sampler.ps1 -Seconds 8 -Out samples.json
# Prints and saves {changes, samples, rects: [{t, l, t, w, h}]}. A change is any new rectangle. While the island is open
# and you switch tabs this should stay at zero.
param([double]$Seconds = 8, [string]$Out = '', [int]$EveryMs = 4)
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public class HaloSample { [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; } }
'@
$proc = Get-Process halo-desktop -ErrorAction Stop
$h = [IntPtr]$proc.MainWindowHandle
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$rects = New-Object System.Collections.Generic.List[object]
$last = ''; $n = 0
while ($sw.Elapsed.TotalSeconds -lt $Seconds) {
  $r = New-Object HaloSample+RECT
  [HaloSample]::GetWindowRect($h, [ref]$r) | Out-Null
  $key = "$($r.L),$($r.T),$($r.R),$($r.B)"
  if ($key -ne $last) { $rects.Add([pscustomobject]@{ ms = [int]$sw.ElapsedMilliseconds; l = $r.L; t = $r.T; w = $r.R - $r.L; h = $r.B - $r.T }); $last = $key }
  $n++
  Start-Sleep -Milliseconds $EveryMs
}
$res = [pscustomobject]@{ changes = [math]::Max(0, $rects.Count - 1); samples = $n; rects = $rects }
if ($Out) { $res | ConvertTo-Json -Depth 4 | Set-Content -Path $Out -Encoding utf8 }
Write-Host ("window rectangle changed {0} time(s) in {1}s ({2} samples)" -f $res.changes, $Seconds, $n)
foreach ($x in $rects) { Write-Host ("  +{0,5} ms  {1} x {2} at ({3}, {4})" -f $x.ms, $x.w, $x.h, $x.l, $x.t) }
