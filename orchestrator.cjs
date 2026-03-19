/**
 * orchestrator.cjs — Tecrubelerim Pipeline Orkestratörü + DB Monitoring
 * 
 * Kurulum: node orchestrator.cjs
 * Scheduler: Her 4 saatte bir çalıştır
 */

'use strict';
const { execSync, spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');
const ps   = require('./pipeline-status.cjs');

const ROOT = __dirname;
const LOG  = path.join(ROOT, 'orchestrator.log');
const NODE = process.execPath;

const PIPELINES = {
  reviewEmbed: {
    name       : 'Review Embedding',
    script     : 'embed-pipeline.cjs',
    lock       : 'embed-pipeline.lock',
    logFile    : path.join(ROOT, 'embed-pipeline.log'),
    args       : [],
    nodeArgs   : ['--max-old-space-size=512'],
    priority   : 1,
  },
  bizEmbed: {
    name       : 'Business Embedding',
    script     : 'biz-embed-pipeline.cjs',
    lock       : 'biz-embed-pipeline.lock',
    logFile    : path.join(ROOT, 'biz-embed-pipeline.log'),
    args       : [],
    nodeArgs   : ['--expose-gc', '--max-old-space-size=2048'],
    priority   : 2,
  },
  enrich: {
    name       : 'AI Enrichment',
    script     : 'enrich-pipeline.cjs',
    lock       : 'enrich-pipeline.lock',
    logFile    : path.join(ROOT, 'enrich-pipeline.log'),
    args       : ['--resume'],
    nodeArgs   : ['--max-old-space-size=1024'],
    priority   : 3,
  },
};

function log(msg) {
  const ts   = new Date().toLocaleString('tr-TR');
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
}

function isRunning(lockFile) {
  const lockPath = path.join(ROOT, lockFile);
  if (!fs.existsSync(lockPath)) return false;
  try {
    const pid = parseInt(fs.readFileSync(lockPath, 'utf8').trim());
    if (isNaN(pid)) return false;
    try { process.kill(pid, 0); return true; }
    catch { fs.unlinkSync(lockPath); log(`⚠ Eski lock temizlendi: ${lockFile}`); return false; }
  } catch { return false; }
}

function getPidFromLock(lockFile) {
  try {
    const lockPath = path.join(ROOT, lockFile);
    if (!fs.existsSync(lockPath)) return null;
    const pid = parseInt(fs.readFileSync(lockPath, 'utf8').trim());
    return isNaN(pid) ? null : pid;
  } catch { return null; }
}

function ollamaAlive() {
  try { execSync('curl -s --max-time 3 http://localhost:11434/api/tags', { stdio: 'pipe' }); return true; }
  catch { return false; }
}

async function runPipeline(key, pipeline) {
  const scriptPath = path.join(ROOT, pipeline.script);
  if (!fs.existsSync(scriptPath)) {
    log(`❌ Script bulunamadı: ${pipeline.script}`);
    return false;
  }

  log(`▶ Başlatılıyor: ${pipeline.name}`);

  // DB'ye başlangıç kaydı
  let run = null;
  try {
    run = await ps.startRun({
      pipeline: key,
      logFile: pipeline.logFile,
      message: `${pipeline.name} başlatılıyor`,
    });
  } catch (e) {
    log(`⚠ DB kayıt hatası (devam): ${e.message}`);
  }

  const out = fs.openSync(pipeline.logFile, 'a');
  const child = spawn(NODE, [...pipeline.nodeArgs, scriptPath, ...pipeline.args], {
    detached: true,
    stdio: ['ignore', out, out],
    cwd: ROOT,
  });

  // Lock'a PID yaz
  fs.writeFileSync(path.join(ROOT, pipeline.lock), child.pid.toString());

  // DB'ye PID güncelle
  if (run) {
    try {
      await ps.updateRun({ runId: run.id, pipeline: key, message: `Çalışıyor (PID: ${child.pid})` });
    } catch {}
  }

  child.unref();
  log(`✓ ${pipeline.name} başlatıldı (PID: ${child.pid})`);

  // Child bitince DB'ye yaz (detached olduğu için bu çalışmaz — webhook/pipeline kendi bitirir)
  // Bunun yerine pipeline-status.cjs'i doğrudan pipeline'lara ekleyin
  return true;
}

async function main() {
  log('═'.repeat(60));
  log('Orkestratör başladı');

  const ollama = ollamaAlive();
  log(`Ollama durumu: ${ollama ? '✓ çalışıyor' : '✗ kapalı'}`);

  const sorted = Object.entries(PIPELINES).sort((a, b) => a[1].priority - b[1].priority);
  let started = 0;

  for (const [key, pipeline] of sorted) {
    const running = isRunning(pipeline.lock);

    if (running) {
      log(`⏳ Zaten çalışıyor: ${pipeline.name}`);
      // DB'yi güncelle — RUNNING olarak işaretle
      try {
        await ps.ensureState(key);
        const pid = getPidFromLock(pipeline.lock);
        // state zaten RUNNING ise dokunma
      } catch {}
      continue;
    }

    const ollamaPipelines = ['reviewEmbed', 'bizEmbed', 'enrich'];
    if (ollamaPipelines.includes(key) && !ollama) {
      log(`⚠ Ollama kapalı, atlanıyor: ${pipeline.name}`);
      continue;
    }

    if (ollamaPipelines.includes(key)) {
      const anyOllamaRunning = ollamaPipelines.some(k => k !== key && isRunning(PIPELINES[k]?.lock));
      if (anyOllamaRunning) {
        log(`⏸ Başka Ollama pipeline çalışıyor: ${pipeline.name}`);
        continue;
      }
    }

    await runPipeline(key, pipeline);
    started++;
    await new Promise(r => setTimeout(r, 3000));
  }

  if (started === 0) log('ℹ Tüm pipeline\'lar çalışıyor veya Ollama kapalı');
  log('Orkestratör tamamlandı');
  log('═'.repeat(60));

  await ps.disconnect();
}

main().catch(async e => {
  log(`HATA: ${e.message}`);
  await ps.disconnect();
});
