/**
 * orchestrator.cjs — Tecrubelerim Pipeline Orkestratörü
 * 
 * Tek scheduler task ile tüm pipeline'ları yönetir.
 * Çakışma kontrolü yapar, sıra belirler, log tutar.
 * 
 * Kurulum: node orchestrator.cjs
 * Scheduler: Her 4 saatte bir çalıştır
 */

'use strict';
const { execSync, spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');

const ROOT    = __dirname;
const LOG     = path.join(ROOT, 'orchestrator.log');
const NODE    = process.execPath;

// ── Pipeline tanımları ────────────────────────────────────────────────────
const PIPELINES = {
  reviewEmbed: {
    name        : 'Review Embedding',
    script      : 'embed-pipeline.cjs',
    lock        : 'embed-pipeline.lock',
    args        : [],
    nodeArgs    : ['--max-old-space-size=512'],
    maxRunHours : 3,
    priority    : 1, // düşük = önce çalışır
  },
  bizEmbed: {
    name        : 'Business Embedding',
    script      : 'biz-embed-pipeline.cjs',
    lock        : 'biz-embed-pipeline.lock',
    args        : [],
    nodeArgs    : ['--expose-gc', '--max-old-space-size=2048'],
    maxRunHours : 6,
    priority    : 2,
  },
  enrich: {
    name        : 'AI Enrichment',
    script      : 'enrich-pipeline.cjs',
    lock        : 'enrich-pipeline.lock',
    args        : ['--resume'],
    nodeArgs    : ['--max-old-space-size=1024'],
    maxRunHours : 4,
    priority    : 3,
  },
};

// ── Log ──────────────────────────────────────────────────────────────────
function log(msg) {
  const ts  = new Date().toLocaleString('tr-TR');
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
}

// ── Lock kontrol ─────────────────────────────────────────────────────────
function isRunning(lockFile) {
  const lockPath = path.join(ROOT, lockFile);
  if (!fs.existsSync(lockPath)) return false;

  try {
    const pid = parseInt(fs.readFileSync(lockPath, 'utf8').trim());
    if (isNaN(pid)) return false;

    // PID hala çalışıyor mu?
    try {
      process.kill(pid, 0); // sinyal göndermez, sadece kontrol eder
      return true; // PID var = çalışıyor
    } catch {
      // PID yok — lock eski kalmış, temizle
      fs.unlinkSync(lockPath);
      log(`⚠  Eski lock temizlendi: ${lockFile} (PID ${pid} bulunamadı)`);
      return false;
    }
  } catch {
    return false;
  }
}

// ── Ollama sağlık kontrolü ────────────────────────────────────────────────
function ollamaAlive() {
  try {
    execSync('curl -s --max-time 3 http://localhost:11434/api/tags', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// ── Pipeline çalıştır ─────────────────────────────────────────────────────
function runPipeline(key, pipeline) {
  const scriptPath = path.join(ROOT, pipeline.script);
  if (!fs.existsSync(scriptPath)) {
    log(`❌ Script bulunamadı: ${pipeline.script}`);
    return false;
  }

  log(`▶  Başlatılıyor: ${pipeline.name}`);

  const child = spawn(NODE, [...pipeline.nodeArgs, scriptPath, ...pipeline.args], {
    detached : true,
    stdio    : 'ignore',
    cwd      : ROOT,
  });

  child.unref();
  log(`✓  ${pipeline.name} başlatıldı (PID: ${child.pid})`);
  return true;
}

// ── Ana mantık ────────────────────────────────────────────────────────────
async function main() {
  log('═'.repeat(60));
  log('Orkestratör başladı');

  // Ollama kontrolü (embed ve enrich için gerekli)
  const ollama = ollamaAlive();
  log(`Ollama durumu: ${ollama ? '✓ çalışıyor' : '✗ kapalı'}`);

  // Her pipeline'ı kontrol et
  const sorted = Object.entries(PIPELINES).sort((a, b) => a[1].priority - b[1].priority);
  let started = 0;

  for (const [key, pipeline] of sorted) {
    const running = isRunning(pipeline.lock);

    if (running) {
      log(`⏳ Zaten çalışıyor: ${pipeline.name}`);
      continue;
    }

    // Ollama gereken pipeline'lar için kontrol
    const needsOllama = ['reviewEmbed', 'bizEmbed', 'enrich'].includes(key);
    if (needsOllama && !ollama) {
      log(`⚠  Ollama kapalı, atlanıyor: ${pipeline.name}`);
      continue;
    }

    // Aynı anda 1 Ollama pipeline çalışsın (RAM için)
    const ollamaPipelines = ['reviewEmbed', 'bizEmbed', 'enrich'];
    if (ollamaPipelines.includes(key)) {
      const anyOllamaRunning = ollamaPipelines.some(k =>
        k !== key && isRunning(PIPELINES[k].lock)
      );
      if (anyOllamaRunning) {
        log(`⏸  Başka Ollama pipeline çalışıyor, bekliyor: ${pipeline.name}`);
        continue;
      }
    }

    runPipeline(key, pipeline);
    started++;

    // Her pipeline arasında 3 saniye bekle
    await new Promise(r => setTimeout(r, 3000));
  }

  if (started === 0) {
    log('ℹ  Tüm pipeline\'lar zaten çalışıyor veya Ollama kapalı');
  }

  log('Orkestratör tamamlandı');
  log('═'.repeat(60));
}

main().catch(e => log(`HATA: ${e.message}`));
