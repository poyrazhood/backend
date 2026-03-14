/**
 * tecrubelerim.com — Review Embedding Pipeline
 * 
 * Kullanım:
 *   node embed-pipeline.js
 *   node embed-pipeline.js --offset 0 --limit 200000        (PC-1)
 *   node embed-pipeline.js --offset 200000 --limit 200000   (PC-2)
 *   node embed-pipeline.js --batch-size 64
 * 
 * Gereksinimler:
 *   npm install @prisma/client better-sqlite3 node-fetch
 *   Ollama çalışıyor olmalı: C:\Users\PC\AppData\Local\Programs\Ollama\ollama.exe
 */

const { PrismaClient } = require('@prisma/client');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Lock — ayni anda sadece 1 instance calissin
const LOCK_FILE = path.join(__dirname, 'embed-pipeline.lock');
if (fs.existsSync(LOCK_FILE)) {
  const pid = fs.readFileSync(LOCK_FILE, 'utf8').trim();
  console.log('Zaten calisiyor (PID: ' + pid + '), atlaniyor.');
  process.exit(0);
}
fs.writeFileSync(LOCK_FILE, String(process.pid));
const cleanLock = () => { try { fs.unlinkSync(LOCK_FILE); } catch {} };
process.on('exit', cleanLock);
process.on('SIGINT', () => { cleanLock(); process.exit(0); });
process.on('uncaughtException', (e) => { cleanLock(); console.error(e); process.exit(1); });

// ── Config ──────────────────────────────────────────────────────────────────
const OLLAMA_URL   = 'http://localhost:11434';
const EMBED_MODEL  = 'mxbai-embed-large';
const QUEUE_DB     = path.join(__dirname, 'embed-queue.db');

// CLI args
const args = Object.fromEntries(
  process.argv.slice(2)
    .reduce((acc, v, i, arr) => {
      if (v.startsWith('--')) acc.push([v.slice(2), arr[i + 1]]);
      return acc;
    }, [])
);

const OFFSET     = parseInt(args.offset     ?? '0');
const LIMIT      = parseInt(args.limit      ?? '0');   // 0 = tümü
const BATCH_SIZE = parseInt(args['batch-size'] ?? '32');

// ── SQLite queue/state DB ────────────────────────────────────────────────────
const qdb = new Database(QUEUE_DB);
qdb.exec(`
  CREATE TABLE IF NOT EXISTS progress (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS failed (
    reviewId  TEXT PRIMARY KEY,
    error     TEXT,
    at        TEXT DEFAULT (datetime('now'))
  );
`);

const getState  = (k, def) => JSON.parse(qdb.prepare('SELECT value FROM progress WHERE key=?').get(k)?.value ?? JSON.stringify(def));
const setState  = (k, v)   => qdb.prepare('INSERT OR REPLACE INTO progress(key,value) VALUES(?,?)').run(k, JSON.stringify(v));
const logFailed = (id, e)  => qdb.prepare('INSERT OR REPLACE INTO failed(reviewId,error) VALUES(?,?)').run(id, String(e));

// ── Prisma ───────────────────────────────────────────────────────────────────
const prisma = new PrismaClient({ log: [] });

// ── Helpers ──────────────────────────────────────────────────────────────────
function buildText(review) {
  const level = review.authorLevel ?? 'bilinmiyor';
  return `${review.content} | ${review.rating} yıldız | ${level}`;
}

async function fetchEmbeddings(texts) {
  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  // Ollama /api/embed returns { embeddings: [[...], [...]] }
  return data.embeddings;
}

async function upsertEmbeddings(batch, embeddings) {
  // pgvector: vector literal '[0.1,0.2,...]'
  const values = batch.map((r, i) => {
    const vec = '[' + embeddings[i].join(',') + ']';
    return { reviewId: r.id, model: EMBED_MODEL, embedding: vec };
  });

  // Prisma doesn't natively support vector type → raw SQL
  for (const v of values) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ReviewEmbedding" (id, "reviewId", model, embedding, "createdAt")
       VALUES (gen_random_uuid(), $1, $2, $3::vector, now())
       ON CONFLICT ("reviewId") DO UPDATE SET embedding = EXCLUDED.embedding, model = EXCLUDED.model`,
      v.reviewId, v.model, v.embedding
    );
  }
}

// ── Dashboard ────────────────────────────────────────────────────────────────
let stats = {
  processed: 0,
  errors:    0,
  startTime: Date.now(),
  total:     0,
};

function dashboard() {
  const elapsed  = (Date.now() - stats.startTime) / 1000;
  const speed    = stats.processed / elapsed;           // reviews/s
  const remaining = stats.total - stats.processed;
  const eta      = speed > 0 ? remaining / speed : Infinity;
  const etaStr   = isFinite(eta) ? fmtDuration(eta) : '?';
  const pct      = stats.total > 0 ? ((stats.processed / stats.total) * 100).toFixed(1) : '0.0';

  process.stdout.write(
    `\r[${new Date().toLocaleTimeString('tr-TR')}] ` +
    `${stats.processed.toLocaleString()}/${stats.total.toLocaleString()} (${pct}%) | ` +
    `${speed.toFixed(1)} rev/s | ` +
    `ETA: ${etaStr} | ` +
    `Hata: ${stats.errors}    `
  );
}

function fmtDuration(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return [h && `${h}s`, m && `${m}d`, `${s}sn`].filter(Boolean).join(' ');
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🚀 tecrubelerim.com — Embedding Pipeline`);
  console.log(`   Model:      ${EMBED_MODEL}`);
  console.log(`   Batch size: ${BATCH_SIZE}`);
  console.log(`   Offset:     ${OFFSET}`);
  console.log(`   Limit:      ${LIMIT || '(tümü)'}`);
  console.log(`   Queue DB:   ${QUEUE_DB}\n`);

  // Ollama bağlantı testi
  try {
    const ping = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!ping.ok) throw new Error('Ollama yanıt vermedi');
    console.log('✅ Ollama bağlantısı OK');
  } catch (e) {
    console.error('❌ Ollama bağlantı hatası:', e.message);
    console.error('   Lütfen Ollama\'yı başlatın:');
    console.error('   C:\\Users\\PC\\AppData\\Local\\Programs\\Ollama\\ollama.exe serve');
    process.exit(1);
  }

  // Kaldığı yerden devam için cursor
  const stateKey   = `cursor_off${OFFSET}_lim${LIMIT}`;
  let   lastCursor = getState(stateKey, null);   // son işlenen reviewId

  // Toplam sayısı
  const whereBase = {
    content: { not: null },
    embedding: null,
  };

  stats.total = await prisma.externalReview.count({ where: whereBase });
  console.log(`📊 Embed edilecek yorum sayısı: ${stats.total.toLocaleString()}`);

  if (stats.total === 0) {
    console.log('✅ Tüm yorumlar zaten embed edilmiş!');
    return;
  }

  const dashInterval = setInterval(dashboard, 1000);

  let cursor = lastCursor;
  let done   = false;

  while (!done) {
    // Batch çek
    const reviews = await prisma.externalReview.findMany({
      where:   whereBase,
      select:  { id: true, content: true, rating: true, authorLevel: true },
      orderBy: { id: 'asc' },
      take:    BATCH_SIZE,
      skip:    cursor ? 1 : OFFSET,
      cursor:  cursor ? { id: cursor } : undefined,
    });

    if (reviews.length === 0) { done = true; break; }

    // Metinleri oluştur
    const texts = reviews.map(buildText);

    try {
      const embeddings = await fetchEmbeddings(texts);
      await upsertEmbeddings(reviews, embeddings);
      stats.processed += reviews.length;
    } catch (e) {
      // Batch hata verirse tek tek dene
      for (let i = 0; i < reviews.length; i++) {
        try {
          const emb = await fetchEmbeddings([texts[i]]);
          await upsertEmbeddings([reviews[i]], emb);
          stats.processed++;
        } catch (e2) {
          logFailed(reviews[i].id, e2.message);
          stats.errors++;
        }
      }
    }

    // Cursor kaydet
    cursor = reviews[reviews.length - 1].id;
    setState(stateKey, cursor);

    // LIMIT kontrolü
    if (LIMIT > 0 && stats.processed >= LIMIT) { done = true; }
  }

  clearInterval(dashInterval);
  dashboard();

  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);
  console.log(`\n\n✅ Tamamlandı!`);
  console.log(`   Toplam işlenen : ${stats.processed.toLocaleString()}`);
  console.log(`   Hata           : ${stats.errors}`);
  console.log(`   Süre           : ${fmtDuration(parseFloat(elapsed))}`);

  await prisma.$disconnect();
  qdb.close();
}

main().catch(async e => {
  console.error('\n❌ Fatal hata:', e);
  await prisma.$disconnect();
  process.exit(1);
});
