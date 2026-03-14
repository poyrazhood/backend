# setup-orchestrator.ps1
# PowerShell'i Yönetici olarak çalıştır: .\setup-orchestrator.ps1
# 
# Eski task'ları kaldırır, tek orkestratör task kurar.

$ROOT       = "C:\Users\PC\Desktop\tecrubelerim"
$NODE       = "C:\nvm4w\nodejs\node.exe"
$SCRIPT     = "$ROOT\orchestrator.cjs"
$TASK_NAME  = "Tecrubelerim-Orchestrator"
$OLLAMA     = "C:\Users\PC\AppData\Local\Programs\Ollama\ollama.exe"

# ── Eski task'ları kaldır ─────────────────────────────────────────────────
$eskiTasks = @(
  "Tecrubelerim-EmbedPipeline",
  "Tecrubelerim-BizEmbedPipeline",
  "Tecrubelerim-EnrichPipeline",
  "Tecrubelerim-OllamaServe"
)
foreach ($t in $eskiTasks) {
  Unregister-ScheduledTask -TaskName $t -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Kaldırıldı (varsa): $t"
}

# ── Ollama — başlangıçta otomatik ────────────────────────────────────────
Unregister-ScheduledTask -TaskName "Tecrubelerim-Ollama" -Confirm:$false -ErrorAction SilentlyContinue
$ollamaAction   = New-ScheduledTaskAction -Execute $OLLAMA -Argument "serve"
$ollamaTrigger  = New-ScheduledTaskTrigger -AtStartup
$ollamaSettings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 0) -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask `
  -TaskName "Tecrubelerim-Ollama" `
  -Trigger $ollamaTrigger `
  -Action $ollamaAction `
  -Settings $ollamaSettings `
  -RunLevel Highest -Force
Write-Host "✓ Ollama task kuruldu (başlangıçta otomatik)"

# ── Orkestratör — her 4 saatte bir ───────────────────────────────────────
Unregister-ScheduledTask -TaskName $TASK_NAME -Confirm:$false -ErrorAction SilentlyContinue

# Her 4 saatte bir: 00:00, 04:00, 08:00, 12:00, 16:00, 20:00
$saatler = @("00:00", "04:00", "08:00", "12:00", "16:00", "20:00")
$triggers = $saatler | ForEach-Object { New-ScheduledTaskTrigger -Daily -At $_ }

$action   = New-ScheduledTaskAction -Execute $NODE -Argument "orchestrator.cjs" -WorkingDirectory $ROOT
$settings = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit (New-TimeSpan -Hours 5) `
  -StartWhenAvailable `
  -RunOnlyIfNetworkAvailable:$false `
  -MultipleInstances IgnoreNew

Register-ScheduledTask `
  -TaskName $TASK_NAME `
  -Trigger $triggers `
  -Action $action `
  -Settings $settings `
  -RunLevel Highest -Force

Write-Host ""
Write-Host "✓ Orkestratör task kuruldu: $TASK_NAME"
Write-Host "  Çalışma saatleri: $($saatler -join ', ')"
Write-Host ""
Write-Host "Manuel test: node orchestrator.cjs"
Write-Host "Log: $ROOT\orchestrator.log"
Write-Host ""
Write-Host "Kontrol: Get-ScheduledTask | Where-Object { `$_.TaskName -like 'Tecrubelerim*' }"
