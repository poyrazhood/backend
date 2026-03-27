/**
 * biz-embed-pipeline-v2.cjs — tecrubelerim.com
 *
 * Tier sistemi:
 *   Tier 1 — Yorumu olan işletme   → isim + kategori + konum + özellikler + yorumlar
 *   Tier 2 — Yorumu olmayan işletme → isim + kategori + konum + özellikler (metadata only)
 *
 * Kullanım:
 *   node biz-embed-pipeline-v2.cjs
 *   node biz-embed-pipeline-v2.cjs --batch-size=64
 *   node biz-embed-pipeline-v2.cjs --offset=0 --limit=100000
 */

const fs   = require('fs');
const path = require('path');
const Database    = require('better-sqlite3');
const { PrismaClient } = require('@prisma/client');
const ps = require('./pipeline-status.cjs');

const prisma = new PrismaClient();

// ── Config ───────────────────────────────────────────────────────────────────
const OLLAMA_URL   = process.env.OLLAMA_URL          || 'http://127.0.0.1:11434';
const EMBED_MODEL  = process.env.BIZ_EMBED_MODEL     || 'bge-m3';
const BATCH_SIZE   = parseInt(process.env.BIZ_EMBED_BATCH_SIZE || '128', 10);
const MAX_REVIEWS  = 50;   // işletme başına max yorum
const MAX_CHARS    = 3000; // embed metni truncate limiti
const STATUS_INTERVAL_MS = 30_000;

const args = Object.fromEntries(
  process.argv.slice(2).map(arg => {
    const [k, v] = arg.replace(/^--/, '').split('=');
    return [k, v ?? '1'];
  })
);
const OFFSET = parseInt(args.offset ?? '0', 10);
const LIMIT  = parseInt(args.limit  ?? '0', 10);

// ── Lock ─────────────────────────────────────────────────────────────────────
const LOCK_FILE = path.join(__dirname, 'biz-embed-pipeline.lock');
const QUEUE_DB  = path.join(__dirname, 'biz-embed-queue.db');
const LOG_FILE  = path.join(__dirname, 'biz-embed-pipeline-v2.log');

if (fs.existsSync(LOCK_FILE)) {
  const pid = fs.readFileSync(LOCK_FILE, 'utf8').trim();
  console.log(`Zaten calisiyor (PID: ${pid}), atlaniyor.`);
  process.exit(0);
}
fs.writeFileSync(LOCK_FILE, String(process.pid));
const cleanLock = () => { try { fs.unlinkSync(LOCK_FILE); } catch {} };
process.on('SIGINT',           async () => { cleanLock(); try { await prisma.$disconnect(); } catch {} process.exit(0); });
process.on('uncaughtException',async (e) => { cleanLock(); console.error(e); try { await prisma.$disconnect(); } catch {} process.exit(1); });
process.on('unhandledRejection',async(e) => { cleanLock(); console.error(e); try { await prisma.$disconnect(); } catch {} process.exit(1); });

// ── SQLite ────────────────────────────────────────────────────────────────────
const qdb = new Database(QUEUE_DB);
qdb.exec(`
  CREATE TABLE IF NOT EXISTS progress (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS failed (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    businessId TEXT NOT NULL,
    error      TEXT,
    tier       INTEGER DEFAULT 0,
    createdAt  TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
const getState  = (k, d) => { const r = qdb.prepare('SELECT value FROM progress WHERE key=?').get(k); return r ? JSON.parse(r.value) : d; };
const setState  = (k, v) => qdb.prepare('INSERT OR REPLACE INTO progress(key,value) VALUES(?,?)').run(k, JSON.stringify(v));
const logFailed = (bizId, err, tier) => qdb.prepare('INSERT INTO failed(businessId,error,tier) VALUES(?,?,?)').run(bizId, String(err||'unknown'), tier);
const logLine   = (t) => { try { fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${t}\n`, 'utf8'); } catch {} };

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDuration(sec) {
  if (!isFinite(sec) || sec < 0) return '?';
  const s = Math.floor(sec % 60), m = Math.floor((sec/60)%60), h = Math.floor((sec/3600)%24), d = Math.floor(sec/86400);
  const p = [];
  if (d) p.push(`${d}g`); if (h) p.push(`${h}sa`); if (m) p.push(`${m}dk`); if (s||!p.length) p.push(`${s}sn`);
  return p.join(' ');
}

function norm(v) { return v ? String(v).replace(/\s+/g,' ').trim() : ''; }

function safeJson(v, fb={}) {
  if (!v) return fb;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fb; }
}

function pickAttrs(attributes) {
  const a = safeJson(attributes, {});
  const out = [];
  const push = (v) => {
    if (!v) return;
    if (Array.isArray(v)) { v.forEach(x => { const t = norm(x); if (t) out.push(t); }); return; }
    const t = norm(v); if (t) out.push(t);
  };
  push(a.about); push(a.shortDescription); push(a.features); push(a.tags);
  push(a.services); push(a.highlights); push(a.ambience); push(a.cuisine); push(a.specialties);
  return [...new Set(out)].join(', ');
}

/**
 * Tier 1 — yorumlu işletme
 * Tier 2 — yorumsuz işletme (metadata only)
 */
function buildText(biz, reviews = []) {
  const isim      = norm(biz.name);
  const kategori  = norm(biz.category_name || '');
  const lokasyon  = [biz.district, biz.city].map(norm).filter(Boolean).join(', ');
  const ozellik   = pickAttrs(biz.attributes);
  const puan      = biz.averageRating  ? `${biz.averageRating} puan`  : '';
  const yorumSay  = biz.totalReviews   ? `${biz.totalReviews} yorum`  : '';
  const fiyat     = norm(safeJson(biz.attributes,{}).priceRange || '');

  const base = [isim, kategori, lokasyon, ozellik, puan, yorumSay, fiyat].filter(Boolean).join(' | ');

  if (reviews.length === 0) {
    // Tier 2 — sadece metadata
    return (base + ` | ${lokasyon} ${kategori}`).slice(0, MAX_CHARS);
  }

  const reviewTexts  = reviews.map(r => norm(r.content)).filter(Boolean);
  const replyTexts   = reviews.map(r => r.ownerReply).filter(Boolean).map(norm);

  let text;
  if (reviews.length >= 5) {
    text = base + (reviewTexts.length ? ' | Yorumlar: ' + reviewTexts.join(' / ') : '');
  } else {
    text = base
      + (reviewTexts.length ? ' | Kullanicilar diyor ki: ' + reviewTexts.join(' / ') : '')
      + (replyTexts.length  ? ' | Isletme yaniti: '        + replyTexts.join(' / ')  : '')
      + ` | ${kategori||'Isletme'} uzmanligi, ${lokasyon||'yerel'} lokasyonu`;
  }
  return text.slice(0, MAX_CHARS);
}

// ── Ollama ────────────────────────────────────────────────────────────────────
async function fetchEmbeddings(texts) {
  const clean = texts.map(t => { const x = norm(t); return x || 'isletme'; });
  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: clean }),
  });
  if (!res.ok) throw new Error(`Ollama embed hatasi: ${res.status} ${await res.text().catch(()=>'')}`);
  const data = await res.json();
  if (!Array.isArray(data.embeddings)) throw new Error('Ollama embeddings donmedi');
  return data.embeddings;
}

async function upsertEmbedding(bizId, embedding) {
  if (!Array.isArray(embedding) || !embedding.length) throw new Error(`Gecersiz embedding: ${bizId}`);
  const vec = '[' + embedding.join(',') + ']';
  await prisma.$executeRawUnsafe(`
    INSERT INTO "BusinessEmbedding" (id, "businessId", model, embedding, "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, $1, $2, $3::vector, now(), now())
    ON CONFLICT ("businessId") DO UPDATE
      SET embedding = EXCLUDED.embedding,
          model     = EXCLUDED.model,
          "updatedAt" = now()
  `, bizId, EMBED_MODEL, vec);
}

// ── DB Queries ────────────────────────────────────────────────────────────────
async function fetchBatch(cursor) {
  return prisma.$queryRawUnsafe(`
    SELECT b.id, b.name, b.city, b.district, b.attributes,
           b."averageRating", b."totalReviews", c.name as category_name
    FROM "Business" b
    LEFT JOIN "Category" c ON c.id = b."categoryId"
    WHERE b."isActive" = true
      AND b."isDeleted" = false
      AND NOT EXISTS (
        SELECT 1 FROM "BusinessEmbedding" be WHERE be."businessId" = b.id
      )
      ${cursor ? `AND b.id > '${cursor}'` : ''}
    ORDER BY b.id ASC
    LIMIT ${BATCH_SIZE}
    ${!cursor && OFFSET > 0 ? `OFFSET ${OFFSET}` : ''}
  `);
}

async function fetchReviews(bizIds) {
  if (!bizIds.length) return [];
  return prisma.externalReview.findMany({
    where:   { businessId: { in: bizIds }, content: { not: null } },
    select:  { businessId: true, content: true, publishedAt: true, ownerReply: true },
    orderBy: { publishedAt: 'asc' },
  });
}

function groupByBiz(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.businessId)) map.set(r.businessId, []);
    const arr = map.get(r.businessId);
    if (arr.length < MAX_REVIEWS) arr.push(r);
  }
  return map;
}

// ── Progress ──────────────────────────────────────────────────────────────────
function renderProgress(stats) {
  const elapsed = (Date.now() - stats.startTime) / 1000;
  const speed   = stats.processed / Math.max(elapsed, 1);
  const rem     = stats.total ? stats.total - stats.processed : 0;
  const eta     = speed > 0 && rem > 0 ? fmtDuration(rem / speed) : '?';
  const pct     = stats.total ? ((stats.processed / stats.total) * 100).toFixed(1) : '?';
  const t1      = stats.tier1.toLocaleString();
  const t2      = stats.tier2.toLocaleString();
  process.stdout.write(
    `\r[${new Date().toLocaleTimeString('tr-TR')}] ` +
    `${stats.processed.toLocaleString()}/${stats.total?.toLocaleString()||'?'} (${pct}%) | ` +
    `T1:${t1} T2:${t2} | ` +
    `${speed.toFixed(1)} biz/s | ETA: ${eta} | Hata: ${stats.errors}    `
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const stats = { total: null, processed: 0, errors: 0, tier1: 0, tier2: 0, startTime: Date.now() };

  console.log(`\n🚀 tecrubelerim.com — Business Embedding Pipeline v2`);
  console.log(`   Model:      ${EMBED_MODEL}`);
  console.log(`   Batch size: ${BATCH_SIZE}`);
  console.log(`   Max chars:  ${MAX_CHARS}`);
  console.log(`   Offset:     ${OFFSET}`);
  console.log(`   Limit:      ${LIMIT || '(tümü)'}\n`);

  // Ollama ping
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!r.ok) throw new Error();
    console.log('✅ Ollama bağlantısı OK');
  } catch { console.error('❌ Ollama çalışmıyor.'); process.exit(1); }

  // Toplam bekleyen
  const countRes = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) as c FROM "Business" b
    WHERE b."isActive" = true AND b."isDeleted" = false
      AND NOT EXISTS (SELECT 1 FROM "BusinessEmbedding" be WHERE be."businessId" = b.id)
  `);
  stats.total = Number(countRes[0].c);
  console.log(`📊 Embed bekleyen işletme: ${stats.total.toLocaleString()}`);
  console.log(`   → Tier 1 (yorumlu)   : yaklaşık 33.646`);
  console.log(`   → Tier 2 (metadata)  : yaklaşık 270.405\n`);

  if (stats.total === 0) {
    console.log('✅ Tüm işletmeler zaten embed edilmiş!');
    cleanLock(); await prisma.$disconnect(); qdb.close(); return;
  }

  // Pipeline status
  const run   = await ps.startRun({ pipeline: 'bizEmbed', pid: process.pid, message: `Başladı — ${stats.total.toLocaleString()} işletme` });
  const runId = run.id;

  const statusInterval = setInterval(async () => {
    const elapsed = (Date.now() - stats.startTime) / 1000;
    const speed   = parseFloat((stats.processed / Math.max(elapsed, 1)).toFixed(2));
    await ps.updateRun({ runId, pipeline: 'bizEmbed', processed: stats.processed, errors: stats.errors, speedPerSec: speed, message: `${stats.processed.toLocaleString()}/${stats.total.toLocaleString()} işletme embed edildi` });
  }, STATUS_INTERVAL_MS);

  const stateKey = `v2_cursor_off${OFFSET}_lim${LIMIT}`;
  let cursor = getState(stateKey, null);
  let done   = false;

  const dashInterval = setInterval(() => renderProgress(stats), 1000);

  while (!done) {
    const businesses = await fetchBatch(cursor);
    if (!businesses.length) { done = true; break; }

    const bizIds    = businesses.map(b => b.id);
    const allReviews = await fetchReviews(bizIds);
    const reviewMap  = groupByBiz(allReviews);

    const texts    = [];
    const validBiz = [];
    const tiers    = [];

    for (const biz of businesses) {
      const reviews  = reviewMap.get(biz.id) || [];
      const selected = reviews.filter(r => norm(r.content));
      const tier     = selected.length > 0 ? 1 : 2;
      texts.push(buildText({ ...biz, category_name: biz.category_name }, selected));
      validBiz.push(biz);
      tiers.push(tier);
    }

    try {
      const embeddings = await fetchEmbeddings(texts);
      if (!Array.isArray(embeddings) || embeddings.length !== validBiz.length)
        throw new Error('Embedding sayisi uyusmuyor');

      for (let i = 0; i < validBiz.length; i++) {
        await upsertEmbedding(validBiz[i].id, embeddings[i]);
        if (tiers[i] === 1) stats.tier1++; else stats.tier2++;
      }
      stats.processed += validBiz.length;

    } catch (e) {
      logLine(`Batch hata: ${e.message}`);
      // Tek tek dene
      for (let i = 0; i < validBiz.length; i++) {
        try {
          const emb = await fetchEmbeddings([texts[i]]);
          await upsertEmbedding(validBiz[i].id, emb[0]);
          if (tiers[i] === 1) stats.tier1++; else stats.tier2++;
          stats.processed++;
        } catch (e2) {
          logFailed(validBiz[i].id, e2.message, tiers[i]);
          logLine(`Tekli hata | tier=${tiers[i]} | id=${validBiz[i].id} | ${e2.message}`);
          stats.errors++;
        }
      }
    }

    cursor = businesses[businesses.length - 1].id;
    setState(stateKey, cursor);

    if (LIMIT > 0 && stats.processed >= LIMIT) { done = true; break; }
  }

  clearInterval(dashInterval);
  clearInterval(statusInterval);
  renderProgress(stats);

  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);
  console.log(`\n\n✅ Tamamlandı!`);
  console.log(`   Tier 1 (yorumlu)  : ${stats.tier1.toLocaleString()}`);
  console.log(`   Tier 2 (metadata) : ${stats.tier2.toLocaleString()}`);
  console.log(`   Hata              : ${stats.errors}`);
  console.log(`   Süre              : ${fmtDuration(parseFloat(elapsed))}`);

  await ps.finishRun({ runId, pipeline: 'bizEmbed', status: stats.errors > stats.processed * 0.5 ? 'FAILED' : 'SUCCESS', processed: stats.processed, errors: stats.errors, message: `${stats.processed.toLocaleString()} işletme embed edildi (T1:${stats.tier1} T2:${stats.tier2})` });
  await ps.disconnect();
  await prisma.$disconnect();
  qdb.close();
  cleanLock();
}

main().catch(async (e) => {
  console.error('\n❌ Fatal:', e);
  logLine(`Fatal: ${e.message}`);
  await ps.finishRun({ runId: null, pipeline: 'bizEmbed', status: 'FAILED', message: e.message }).catch(() => {});
  await ps.disconnect().catch(() => {});
  try { await prisma.$disconnect(); } catch {}
  try { qdb.close(); } catch {}
  cleanLock();
  process.exit(1);
});
