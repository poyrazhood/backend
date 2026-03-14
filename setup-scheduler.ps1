# Tecrubelerim — Zamanlayıcı Kurulumu
# PowerShell'i Yönetici olarak çalıştır, sonra: .\setup-scheduler.ps1

$batPath    = "C:\Users\PC\Desktop\tecrubelerim\run-embed.bat"
$ollamaPath = "C:\Users\PC\AppData\Local\Programs\Ollama\ollama.exe"
$embedTask  = "Tecrubelerim-EmbedPipeline"
$ollamaTask = "Tecrubelerim-OllamaServe"

# ── 1. Ollama — bilgisayar açılınca otomatik başlasın ─────────────────────
Unregister-ScheduledTask -TaskName $ollamaTask -Confirm:$false -ErrorAction SilentlyContinue

$ollamaAction   = New-ScheduledTaskAction -Execute $ollamaPath -Argument "serve"
$ollamaTrigger  = New-ScheduledTaskTrigger -AtStartup
$ollamaSettings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 0) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
    -TaskName $ollamaTask `
    -Trigger $ollamaTrigger `
    -Action $ollamaAction `
    -Settings $ollamaSettings `
    -RunLevel Highest `
    -Force

# ── 2. Embed Pipeline — günde 6 kez ───────────────────────────────────────
Unregister-ScheduledTask -TaskName $embedTask -Confirm:$false -ErrorAction SilentlyContinue

$saatler = @("04:21", "09:00", "13:00", "17:00", "21:00", "01:00")

$triggers = $saatler | ForEach-Object {
    New-ScheduledTaskTrigger -Daily -At $_
}

$embedAction   = New-ScheduledTaskAction -Execute $batPath
$embedSettings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 3) `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable:$false

Register-ScheduledTask `
    -TaskName $embedTask `
    -Trigger $triggers `
    -Action $embedAction `
    -Settings $embedSettings `
    -RunLevel Highest `
    -Force

Write-Host ""
Write-Host "Gorev 1 kuruldu: $ollamaTask (baslangicta otomatik baslar)"
Write-Host "Gorev 2 kuruldu: $embedTask"
Write-Host "Calisma saatleri: $($saatler -join ', ')"
Write-Host ""
Write-Host "Kontrol: Get-ScheduledTask | Where-Object {`$_.TaskName -like 'Tecrubelerim*'}"
