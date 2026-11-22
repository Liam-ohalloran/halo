# Card 26: shows a real Windows notification, so you can watch it arrive as a Halo banner.
#   powershell -File scripts/send-test-toast.ps1 -Title "Chemistry test marked" -Body "SEQTA" -App "Windows PowerShell"
# -App only changes the name Windows shows. Halo treats messaging apps (WhatsApp, Messages and so on) as messages and hides their text.
param([string]$Title = 'Halo test notification', [string]$Body = 'This is a real Windows toast', [string]$App = 'Windows PowerShell')
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$esc = { param($s) [System.Security.SecurityElement]::Escape($s) }
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml("<toast><visual><binding template=`"ToastGeneric`"><text>$(& $esc $Title)</text><text>$(& $esc $Body)</text></binding></visual></toast>")
$toast = New-Object Windows.UI.Notifications.ToastNotification $xml
# PowerShell's own app id, so it works without registering an app of our own.
$id = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($id).Show($toast)
Write-Host "sent: $Title / $Body"
