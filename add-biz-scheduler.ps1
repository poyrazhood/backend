# PowerShell'i Yönetici olarak çalıştır

$batPath  = "C:\Users\PC\Desktop\tecrubelerim\run-biz-embed.bat"
$taskName = "Tecrubelerim-BizEmbedPipeline"

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

$triggers = @(
    (New-ScheduledTaskTrigger -Daily -At "00:00"),
    (New-ScheduledTaskTrigger -Daily -At "12:00")
)

$action   = New-ScheduledTaskAction -Execute $batPath
$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 6) `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable:$false

Register-ScheduledTask `
    -TaskName $taskName `
    -Trigger $triggers `
    -Action $action `
    -Settings $settings `
    -RunLevel Highest `
    -Force

Write-Host "Gorev kuruldu: $taskName (00:00 ve 12:00)"
