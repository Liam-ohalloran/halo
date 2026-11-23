# Saves the top 520 px of the main screen (the island's area) to a PNG, at real pixel size.
#   powershell -File scripts/screen-top.ps1 -Path screenshots/card-26/banner.png
param([Parameter(Mandatory)][string]$Path, [int]$Height = 520)
Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class ScreenTopDpi { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); }'
[ScreenTopDpi]::SetProcessDPIAware() | Out-Null
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$w = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width
$bmp = New-Object System.Drawing.Bitmap $w, $Height
[System.Drawing.Graphics]::FromImage($bmp).CopyFromScreen(0, 0, 0, 0, $bmp.Size)
$full = if ([System.IO.Path]::IsPathRooted($Path)) { $Path } else { Join-Path (Get-Location) $Path }
New-Item -ItemType Directory -Force (Split-Path $full) | Out-Null
$bmp.Save($full)
$bmp.Dispose()
