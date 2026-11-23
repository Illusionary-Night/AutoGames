# 異常通知：跳出 Windows 桌面通知，並寫入 logs/alerts.md
# 用法：.\scripts\notify.ps1 -Type "用量耗盡" -Message "已達每日 3 輪上限"
param(
    [Parameter(Mandatory = $true)][string]$Type,
    [Parameter(Mandatory = $true)][string]$Message
)

$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root "logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$logFile = Join-Path $logDir "alerts.md"

# 先寫紀錄檔，確保通知失敗時仍有紀錄
$stamp = Get-Date -Format "yyyy-MM-dd HH:mm"
Add-Content -Path $logFile -Value "- [$stamp] **$Type**：$Message" -Encoding UTF8

# 桌面通知（Windows 內建，不需安裝模組）
try {
    [void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
    $xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
    $nodes = $xml.GetElementsByTagName("text")
    [void]$nodes.Item(0).AppendChild($xml.CreateTextNode("遊戲實驗室：$Type"))
    [void]$nodes.Item(1).AppendChild($xml.CreateTextNode($Message))
    $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
    $appId = "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe"
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
} catch {
    Write-Warning "桌面通知失敗，已寫入紀錄檔：$($_.Exception.Message)"
}
