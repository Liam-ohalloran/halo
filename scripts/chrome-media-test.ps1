# Card 26: plays a silent audio track in Chrome (its own temporary profile, not yours) so Windows shows it as a media
# session, the same way YouTube in Chrome does. Halo's Music should pick it up.
#   powershell -File scripts/chrome-media-test.ps1          start it
#   powershell -File scripts/chrome-media-test.ps1 -Stop    close that Chrome (only the one started here)
param([switch]$Stop)
$dir = Join-Path $env:TEMP 'halo-chrome-test'
$profile = Join-Path $dir 'profile'
if ($Stop) {
  Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like "*halo-chrome-test*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Write-Host 'stopped the test Chrome'; exit 0
}
New-Item -ItemType Directory -Force $dir | Out-Null
# Two minutes of silence as a 8 kHz mono WAV.
$rate = 8000; $secs = 120; $n = $rate * $secs
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)
$bw.Write([Text.Encoding]::ASCII.GetBytes('RIFF')); $bw.Write([int](36 + $n * 2)); $bw.Write([Text.Encoding]::ASCII.GetBytes('WAVEfmt '))
$bw.Write([int]16); $bw.Write([int16]1); $bw.Write([int16]1); $bw.Write([int]$rate); $bw.Write([int]($rate * 2)); $bw.Write([int16]2); $bw.Write([int16]16)
$bw.Write([Text.Encoding]::ASCII.GetBytes('data')); $bw.Write([int]($n * 2)); $bw.Write((New-Object byte[] ($n * 2)))
[IO.File]::WriteAllBytes((Join-Path $dir 'silence.wav'), $ms.ToArray())
@'
<!doctype html><title>Halo media test</title>
<audio id="a" src="silence.wav" loop controls autoplay></audio>
<script>
const a = document.getElementById('a')
function setup() { navigator.mediaSession.metadata = new MediaMetadata({ title: 'Halo test track', artist: 'Halo (silent test)', album: 'Card 26' }); a.play().catch(() => {}) }
a.addEventListener('play', setup); setup()
</script>
'@ | Set-Content -Path (Join-Path $dir 'index.html') -Encoding utf8
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
Start-Process $chrome -ArgumentList "--user-data-dir=`"$profile`"", '--autoplay-policy=no-user-gesture-required', '--no-first-run', '--no-default-browser-check', '--window-size=500,300', ("file:///" + ($dir -replace '\\', '/') + '/index.html')
Write-Host 'started: a silent track named Halo test track is playing in Chrome'
