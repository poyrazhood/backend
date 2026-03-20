/**
 * watcher.cjs — Tecrubelerim Pipeline Watcher (Windows uyumlu)
 */

'use strict';
const { spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;
const LOG  = path.join(ROOT, 'watcher.log');
const NODE = process.execPath;
const STATE_FILE = path.join(ROOT, 'watcher-state.json');

const CHECK_INTERVAL_MS = 30_000;

const PIPELINES = [
  {
    key      : 'reviewEmbed',
    name     : 'Review Embedding',
    script   : 'embed-pipeline.cjs',
    lock     : 'embed-pipeline.lock',
    logFile  : path.join(ROOT, 'embed-pipeline.log'),
    nodeArgs : ['--max-old-space-size=512'],
    args     : [],
  },
  {
    key      : 'bizEmbed',
    name     : 'Business Embedding',
    script   : 'biz-embed-pipeline.cjs',
    lock     : 'biz-embed-pipeline.lock',
    logFile  : path.join(ROOT, 'biz-embed-pipeline.log'),
    nodeArgs : ['--expose-gc', '--max-old-space-size=2048'],
    args     : [],
  },
  {
    key      : 'enrich',
    name     : 'AI Zenginleştirme',
    script   : 'enrich-pipelinev3.cjs',
    lock     : 'enrich-pipeline.lock',
    logFile  : path.join(ROOT, 'enrich-pipeline.log'),
    nodeArgs : ['--max-old-space-size=4096'],
    args     : ['--resume', '--limit', '500'],
  },
];

// Aktif child process
let activeChild = null;
let activeKey = null;

// Durum: hangi pipeline sırada
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch {}
  return { currentIndex: 0 };
}

function saveState(state) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state)); } catch {}
}

function log(msg) {
  const ts   = new Date().toLocaleString('tr-TR');
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n'); } catch {}
}

async function ollamaAlive() {
  try {
    const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch { return false; }
}

function startPipeline(pipeline, onFinish) {
  const scriptPath = path.join(ROOT, pipeline.script);
  if (!fs.existsSync(scriptPath)) {
    log(`❌ Script bulunamadı: ${pipeline.script}`);
    onFinish(1);
    return;
  }

  const lockPath = path.join(ROOT, pipeline.lock);
  try { if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath); } catch {}

  const out = fs.openSync(pipeline.logFile, 'a');
  const child = spawn(NODE, [...pipeline.nodeArgs, scriptPath, ...pipeline.args], {
    detached: false,
    stdio: ['ignore', out, out],
    cwd: ROOT,
    env: { ...process.env },
  });

  if (!child.pid) {
    log(`❌ ${pipeline.name} başlatılamadı`);
    onFinish(1);
    return;
  }

  fs.writeFileSync(lockPath, child.pid.toString());
  activeChild = child;
  activeKey = pipeline.key;

  child.on('exit', (code) => {
    activeChild = null;
    activeKey = null;
    try { if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath); } catch {}
    log(`⏹ ${pipeline.name} bitti (kod: ${code ?? '?'})`);
    onFinish(code ?? 0);
  });

  child.on('error', (err) => {
    activeChild = null;
    activeKey = null;
    try { if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath); } catch {}
    log(`❌ ${pipeline.name} hata: ${err.message}`);
    onFinish(1);
  });

  log(`▶ ${pipeline.name} başlatıldı (PID: ${child.pid})`);
}

async function runNext() {
  // Zaten bir şey çalışıyorsa bekle
  if (activeChild && activeChild.exitCode === null) return;

  const ollama = await ollamaAlive();
  if (!ollama) {
    log('⏸ Ollama kapalı, bekleniyor...');
    return;
  }

  const state = loadState();
  const idx = state.currentIndex % PIPELINES.length;
  const pipeline = PIPELINES[idx];

  log(`🚀 ${pipeline.name} başlatılıyor... (${idx + 1}/${PIPELINES.length})`);

  startPipeline(pipeline, (code) => {
    if (code === 0) {
      // Başarıyla bitti, sıradakine geç
      const nextIdx = (idx + 1) % PIPELINES.length;
      saveState({ currentIndex: nextIdx });
      log(`➡ Sıradaki: ${PIPELINES[nextIdx].name}`);
    } else {
      // Hata aldı, aynısını tekrar dene
      log(`⚠ Hata alındı, aynı pipeline tekrar denenecek`);
    }
    // Bitince hemen sıradakini başlat
    setTimeout(runNext, 3000);
  });
}

async function main() {
  log('═'.repeat(50));
  log('Watcher başladı');
  log(`Node: ${NODE}`);
  const state = loadState();
  log(`Başlangıç pipeline: ${PIPELINES[state.currentIndex % PIPELINES.length].name}`);
  log('═'.repeat(50));

  // Tüm eski lock'ları temizle
  for (const p of PIPELINES) {
    const lockPath = path.join(ROOT, p.lock);
    try { if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath); } catch {}
  }

  await runNext();

  // Periyodik kontrol — eğer bir şekilde process ölmüşse tekrar başlat
  setInterval(async () => {
    if (!activeChild || activeChild.exitCode !== null) {
      await runNext();
    }
  }, CHECK_INTERVAL_MS);
}

process.on('SIGINT', () => {
  log('Watcher durduruluyor...');
  if (activeChild) { try { activeChild.kill(); } catch {} }
  process.exit(0);
});

main().catch(e => {
  log(`FATAL: ${e.message}`);
  process.exit(1);
});
