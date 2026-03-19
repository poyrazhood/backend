/**
 * pipeline-webhook-server.cjs
 * Lokalde çalışır. VPS admin panelinden start/stop komutu alır.
 * 
 * Başlatma:
 *   node pipeline-webhook-server.cjs
 * 
 * ngrok ile dışa aç:
 *   ngrok http 7331
 *   Çıkan URL'i VPS .env'e ekle: PIPELINE_WEBHOOK_URL=https://xxxx.ngrok.io
 */

'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const ps   = require('./pipeline-status.cjs');

const PORT   = process.env.WEBHOOK_PORT   || 7331;
const SECRET = process.env.WEBHOOK_SECRET || 'pipeline_webhook_2026';
const ROOT   = __dirname;
const NODE   = process.execPath;

const PIPELINES = {
  reviewEmbed: {
    script  : 'embed-pipeline.cjs',
    lock    : 'embed-pipeline.lock',
    logFile : path.join(ROOT, 'embed-pipeline.log'),
    nodeArgs: ['--max-old-space-size=512'],
    args    : [],
  },
  bizEmbed: {
    script  : 'biz-embed-pipeline.cjs',
    lock    : 'biz-embed-pipeline.lock',
    logFile : path.join(ROOT, 'biz-embed-pipeline.log'),
    nodeArgs: ['--expose-gc', '--max-old-space-size=2048'],
    args    : [],
  },
  enrich: {
    script  : 'enrich-pipeline.cjs',
    lock    : 'enrich-pipeline.lock',
    logFile : path.join(ROOT, 'enrich-pipeline.log'),
    nodeArgs: ['--max-old-space-size=1024'],
    args    : ['--resume'],
  },
};

function getPid(lock) {
  try {
    const f = path.join(ROOT, lock);
    if (!fs.existsSync(f)) return null;
    const pid = parseInt(fs.readFileSync(f, 'utf8').trim());
    return isNaN(pid) ? null : pid;
  } catch { return null; }
}

function isRunning(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function respond(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  // Auth
  if (req.headers['x-webhook-secret'] !== SECRET) return respond(res, 401, { error: 'Yetkisiz' });

  const parts = req.url.split('/').filter(Boolean);

  // GET /status
  if (req.method === 'GET' && parts[0] === 'status') {
    const list = Object.entries(PIPELINES).map(([key, p]) => {
      const pid = getPid(p.lock);
      return { key, running: isRunning(pid), pid: isRunning(pid) ? pid : null };
    });
    return respond(res, 200, { ok: true, pipelines: list });
  }

  // POST /pipeline/:key/start|stop
  if (req.method === 'POST' && parts[0] === 'pipeline' && parts[2]) {
    const key    = parts[1];
    const action = parts[2];
    const p      = PIPELINES[key];
    if (!p) return respond(res, 404, { error: 'Pipeline bulunamadı' });

    if (action === 'start') {
      const pid = getPid(p.lock);
      if (isRunning(pid)) return respond(res, 400, { error: 'Zaten çalışıyor', pid });

      const scriptPath = path.join(ROOT, p.script);
      if (!fs.existsSync(scriptPath)) return respond(res, 404, { error: 'Script bulunamadı' });

      const out   = fs.openSync(p.logFile, 'a');
      const child = require('child_process').spawn(NODE, [...p.nodeArgs, scriptPath, ...p.args], {
        detached: true,
        stdio   : ['ignore', out, out],
        cwd     : ROOT,
      });
      child.unref();

      fs.writeFileSync(path.join(ROOT, p.lock), child.pid.toString());

      // DB'ye kaydet
      try {
        await ps.startRun({ pipeline: key, pid: child.pid, logFile: p.logFile, message: 'Admin panelinden başlatıldı' });
      } catch (e) { console.warn('DB kayıt hatası:', e.message); }

      console.log(`[Webhook] ${key} başlatıldı — PID: ${child.pid}`);
      return respond(res, 200, { ok: true, pid: child.pid, message: `${key} başlatıldı` });
    }

    if (action === 'stop') {
      const pid = getPid(p.lock);
      if (!isRunning(pid)) return respond(res, 400, { error: 'Zaten durmuş' });

      try {
        process.kill(pid, 'SIGTERM');
        setTimeout(() => { try { if (isRunning(pid)) process.kill(pid, 'SIGKILL'); } catch {} }, 3000);
        const lockPath = path.join(ROOT, p.lock);
        if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);

        // DB'ye kaydet
        try {
          await ps.finishRun({ runId: 'manual-stop', pipeline: key, status: 'FAILED', message: 'Admin panelinden durduruldu' });
        } catch {}

        console.log(`[Webhook] ${key} durduruldu — PID: ${pid}`);
        return respond(res, 200, { ok: true, message: `${key} durduruldu` });
      } catch (e) {
        return respond(res, 500, { error: e.message });
      }
    }
  }

  respond(res, 404, { error: 'Bulunamadı' });
});

server.listen(PORT, () => {
  console.log(`\n[Pipeline Webhook] ✓ http://localhost:${PORT}`);
  console.log(`[Pipeline Webhook] Secret: ${SECRET}`);
  console.log(`\nngrok ile dışa açın:`);
  console.log(`  ngrok http ${PORT}`);
  console.log(`  VPS .env'e ekleyin: PIPELINE_WEBHOOK_URL=https://xxxx.ngrok.io\n`);
});
