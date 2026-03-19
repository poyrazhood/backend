/**
 * watcher.cjs — Tecrubelerim Pipeline Watcher
 * 
 * Bilgisayar açıkken sürekli çalışır.
 * Bir pipeline bitince hemen sıradakini başlatır.
 * Scheduled task ile Windows açılışında otomatik başlar.
 * 
 * Kullanım: node watcher.cjs
 */

'use strict';
const { spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;
const LOG  = path.join(ROOT, 'watcher.log');
const NODE = process.execPath;

// Kaç saniyede bir kontrol et
const CHECK_INTERVAL_MS = 60_000; // 1 dakika

const PIPELINES = [
  {
    key      : 'reviewEmbed',
    name     : 'Review Embedding',
    script   : 'embed-pipeline.cjs',
    lock     : 'embed-pipeline.lock',
    logFile  : path.join(ROOT, 'embed-pipeline.log'),
    nodeArgs : ['--max-old-space-size=512'],
    args     : [],
    needsOllama: true,
  },
  {
    key      : 'bizEmbed',
    name     : 'Business Embedding',
    script   : 'biz-embed-pipeline.cjs',
    lock     : 'biz-embed-pipeline.lock',
    logFile  : path.join(ROOT, 'biz-embed-pipeline.log'),
    nodeArgs : ['--expose-gc', '--max-old-space-size=2048'],
    args     : [],
    needsOllama: true,
  },
  {
    key      : 'enrich',
    name     : 'AI Zenginleştirme',
    script   : 'enrich-pipelinev3.cjs',
    lock     : 'enrich-pipeline.lock',
    logFile  : path.join(ROOT, 'enrich-pipeline.log'),
    nodeArgs : ['--max-old-space-size=1024'],
    args     : ['--resume'],
    needsOllama: true,
  },
];

function log(msg) {
  const ts   = new Date().toLocaleString('tr-TR');
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n'); } catch {}
}

function isRunning(lockFile) {
  const lockPath = path.join(ROOT, lockFile);
  if (!fs.existsSync(lockPath)) return false;
  try {
    const pid = parseInt(fs.readFileSync(lockPath, 'utf8').trim());
    if (isNaN(pid)) return false;
    try { process.kill(pid, 0); return true; }
    catch { fs.unlinkSync(lockPath); return false; }
  } catch { return false; }
}

async function ollamaAlive() {
  try {
    const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch { return false; }
}

function startPipeline(pipeline) {
  const scriptPath = path.join(ROOT, pipeline.script);
  if (!fs.existsSync(scriptPath)) {
    log(`❌ Script bulunamadı: ${pipeline.script}`);
    return false;
  }

  const out = fs.openSync(pipeline.logFile, 'a');
  const child = spawn(NODE, [...pipeline.nodeArgs, scriptPath, ...pipeline.args], {
    detached: true,
    stdio: ['ignore', out, out],
    cwd: ROOT,
  });

  fs.writeFileSync(path.join(ROOT, pipeline.lock), child.pid.toString());
  child.unref();
  log(`▶ ${pipeline.name} başlatıldı (PID: ${child.pid})`);
  return true;
}

async function tick() {
  const ollama = await ollamaAlive();

  // Şu an Ollama kullanan kaç pipeline çalışıyor?
  const runningOllama = PIPELINES
    .filter(p => p.needsOllama && isRunning(p.lock))
    .map(p => p.name);

  for (const pipeline of PIPELINES) {
    if (isRunning(pipeline.lock)) continue; // zaten çalışıyor

    // Ollama gerektiriyorsa kontrol et
    if (pipeline.needsOllama) {
      if (!ollama) {
        // Ollama kapalı, sessizce geç
        continue;
      }
      if (runningOllama.length > 0) {
        // Başka Ollama pipeline çalışıyor, bekle
        continue;
      }
    }

    // Script var mı?
    const scriptPath = path.join(ROOT, pipeline.script);
    if (!fs.existsSync(scriptPath)) continue;

    log(`🚀 ${pipeline.name} başlatılıyor...`);
    startPipeline(pipeline);

    // Aynı anda sadece 1 Ollama pipeline — başlattıktan sonra döngüyü kır
    if (pipeline.needsOllama) break;
  }
}

async function main() {
  log('═'.repeat(50));
  log('Watcher başladı — her 1 dakikada kontrol');
  log('Durdurmak için: Ctrl+C');
  log('═'.repeat(50));

  // İlk kontrol
  await tick();

  // Periyodik kontrol
  setInterval(async () => {
    try { await tick(); } catch (e) { log(`Tick hata: ${e.message}`); }
  }, CHECK_INTERVAL_MS);
}

// Graceful shutdown
process.on('SIGINT', () => {
  log('Watcher durduruluyor...');
  process.exit(0);
});

main().catch(e => {
  log(`FATAL: ${e.message}`);
  process.exit(1);
});
