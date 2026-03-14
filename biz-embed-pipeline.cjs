/**
 * tecrubelerim.com — Business Embedding Pipeline
 *
 * Kullanım:
 *   node biz-embed-pipeline.cjs
 *   node biz-embed-pipeline.cjs --batch-size 16
 *   node biz-embed-pipeline.cjs --offset 0 --limit 100000
 *
 * Koşul:
 *   - Detayı çekilmiş (coverPhoto VEYA about dolu)
 *   - En az 1 yorumu var
 *   - BusinessEmbedding henüz yok
 */

const { PrismaClient } = require('@prisma/client');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Lock — ayni anda sadece 1 instance calissin
const LOCK_FILE = path.join(__dirname, 'biz-embed-pipeline.lock');
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

// ── Config ───────────────────────────────────────────────────────────────────
const OLLAMA_URL   = 'http://localhost:11434';
const EMBED_MODEL  = 'bge-m3';
const QUEUE_DB     = path.join(__dirname, 'biz-embed-queue.db');

const args = Object.fromEntries(
  process.argv.slice(2)
    .reduce((acc, v, i, arr) => { if (v.startsWith('--')) acc.push([v.slice(2), arr[i+1]]); return acc; }, [])
);
const OFFSET     = parseInt(args.offset        ?? '0');
const LIMIT      = parseInt(args.limit         ?? '0');
const BATCH_SIZE = parseInt(args['batch-size'] ?? '16');

// ── SQLite queue ──────────────────────────────────────────────────────────────
const qdb = new Database(QUEUE_DB);
qdb.exec(`
  CREATE TABLE IF NOT EXISTS progress (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS failed   (bizId TEXT PRIMARY KEY, error TEXT, at TEXT DEFAULT (datetime('now')));
`);
const getState  = (k, d) => JSON.parse(qdb.prepare('SELECT value FROM progress WHERE key=?').get(k)?.value ?? JSON.stringify(d));
const setState  = (k, v) => qdb.prepare('INSERT OR REPLACE INTO progress(key,value) VALUES(?,?)').run(k, JSON.stringify(v));
const logFailed = (id, e) => qdb.prepare('INSERT OR REPLACE INTO failed(bizId,error) VALUES(?,?)').run(id, String(e));

// ── Prisma ────────────────────────────────────────────────────────────────────
const prisma = new PrismaClient({ log: [] });

// ── Segment tespiti ──────────────────────────────────────────────────────────
// Altin: 5+  yorum → 2 eski + 2 yeni + 1 genel
// Gumus: 1-4 yorum → tüm yorumlar + ownerReply + kategori/lokasyon tekrarı
// Bronz: 0   yorum → sadece yapılandırılmış veri + kategori/lokasyon tekrarı

function selectReviews(reviews) {
  if (!reviews.length) return [];

  const sorted = [...reviews].sort((a, b) => {
    const da = a.publishedAt ? new Date(a.publishedAt) : new Date(0);
    const db = b.publishedAt ? new Date(b.publishedAt) : new Date(0);
    return da - db;
  });

  // Altin: 5+ yorum
  if (reviews.length >= 5) {
    const half   = Math.ceil(sorted.length / 2);
    const oldest = sorted.slice(0, half);
    const newest = sorted.slice(half);
    const topN   = (arr, n) => [...arr].sort((a, b) => (b.content?.length ?? 0) - (a.content?.length ?? 0)).slice(0, n);
    const selected = [...topN(oldest, 2), ...topN(newest, 2), ...topN(reviews, 1)];
    const seen = new Set();
    return selected.filter(r => seen.has(r.id) ? false : seen.add(r.id)).slice(0, 5);
  }

  // Gumus: 1-4 yorum — hepsini al
  return reviews;
}

function buildBizText(biz, reviews, ownerReplies = []) {
  const attr        = biz.attributes ?? {};
  const ozellikler  = attr.about?.['Özellikler']?.join(', ') ?? '';
  const kategori    = biz.category?.name ?? attr.subcategory ?? '';
  const lokasyon    = [biz.city, biz.district].filter(Boolean).join(' ');
  const fiyat       = attr.priceRange ? ` | ${attr.priceRange}` : '';
  const rating      = biz.averageRating ? `${Number(biz.averageRating).toFixed(1)} yıldız` : '';
  const yorumSayisi = biz.totalReviews ? `${biz.totalReviews} yorum` : '';

  const baseparts = [biz.name, kategori, lokasyon, ozellikler, rating, yorumSayisi, fiyat].filter(Boolean);
  const header    = baseparts.join(' | ');

  const reviewTexts = reviews.map(r => r.content?.trim()).filter(Boolean);
  const replyTexts  = ownerReplies.filter(Boolean).map(r => r.trim());

  // Altin (5+)
  if (reviews.length >= 5) {
    const yorumlar = reviewTexts.length > 0 ? ' | Yorumlar: ' + reviewTexts.join(' / ') : '';
    return header + yorumlar;
  }
  // Gumus (1-4)
  else if (reviews.length >= 1) {
    const yorumlar = reviewTexts.length > 0 ? ' | Kullanicilar diyor ki: ' + reviewTexts.join(' / ') : '';
    const replies  = replyTexts.length  > 0 ? ' | Isletme yaniti: ' + replyTexts.join(' / ') : '';
    const tekrar   = ` | ${kategori} uzmanligi, ${lokasyon} lokasyonu`;
    return header + yorumlar + replies + tekrar;
  }
  // Bronz (0 yorum)
  else {
    return header + ` | ${lokasyon} ${kategori}`;
  }
}

// ── Ollama ────────────────────────────────────────────────────────────────────
async function fetchEmbeddings(texts) {
  // Bos veya null metin fallback
  const clean = texts.map(t => (t && t.trim().length > 0) ? t.trim() : 'isletme');
  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: clean }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Ollama HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()).embeddings;
}

async function upsertEmbedding(bizId, embedding) {
  const vec = '[' + embedding.join(',') + ']';
  await prisma.$executeRawUnsafe(
    `INSERT INTO "BusinessEmbedding" (id, "businessId", model, embedding, "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, $3::vector, now(), now())
     ON CONFLICT ("businessId") DO UPDATE
     SET embedding = EXCLUDED.embedding, model = EXCLUDED.model, "updatedAt" = now()`,
    bizId, EMBED_MODEL, vec
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
const stats = { processed: 0, errors: 0, startTime: Date.now(), total: 0 };

function fmtDuration(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sc = Math.floor(s % 60);
  return [h && `${h}s`, m && `${m}d`, `${sc}sn`].filter(Boolean).join(' ');
}

function dashboard() {
  const elapsed = (Date.now() - stats.startTime) / 1000;
  const speed   = stats.processed / Math.max(elapsed, 1);
  const eta     = speed > 0 ? (stats.total - stats.processed) / speed : Infinity;
  const pct     = stats.total > 0 ? ((stats.processed / stats.total) * 100).toFixed(1) : '0.0';
  process.stdout.write(
    `\r[${new Date().toLocaleTimeString('tr-TR')}] ` +
    `${stats.processed.toLocaleString()}/${stats.total.toLocaleString()} (${pct}%) | ` +
    `${speed.toFixed(1)} biz/s | ETA: ${isFinite(eta) ? fmtDuration(eta) : '?'} | Hata: ${stats.errors}    `
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🚀 tecrubelerim.com — Business Embedding Pipeline`);
  console.log(`   Model:      ${EMBED_MODEL}`);
  console.log(`   Batch size: ${BATCH_SIZE}`);
  console.log(`   Offset:     ${OFFSET}`);
  console.log(`   Limit:      ${LIMIT || '(tümü)'}`);
  console.log(`   Queue DB:   ${QUEUE_DB}\n`);

  // Ollama kontrol
  try {
    const ping = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!ping.ok) throw new Error();
    console.log('✅ Ollama bağlantısı OK');
  } catch {
    console.error('❌ Ollama çalışmıyor. Lütfen başlatın:');
    console.error('   C:\\Users\\PC\\AppData\\Local\\Programs\\Ollama\\ollama.exe serve');
    process.exit(1);
  }

  // Toplam sayı — detayı VE yorumu olan, henüz embed edilmemiş işletmeler
  stats.total = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) as c FROM "Business" b
    WHERE (
      b.attributes->>'coverPhoto' IS NOT NULL
      OR b.attributes->'about' IS NOT NULL
    )
    AND EXISTS (
      SELECT 1 FROM "ExternalReview" er
      WHERE er."businessId" = b.id AND er.content IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM "BusinessEmbedding" be WHERE be."businessId" = b.id
    )
  `).then(r => Number(r[0].c));

  console.log(`📊 Embed edilecek işletme: ${stats.total.toLocaleString()}`);

  if (stats.total === 0) {
    console.log('✅ Tüm uygun işletmeler zaten embed edilmiş!');
    await prisma.$disconnect(); qdb.close(); return;
  }

  const stateKey  = `cursor_off${OFFSET}_lim${LIMIT}`;
  let cursor      = getState(stateKey, null);
  const dashTimer = setInterval(dashboard, 1000);
  let done        = false;

  while (!done) {
    // Batch işletme çek
    const businesses = await prisma.$queryRawUnsafe(`
      SELECT b.id, b.name, b.city, b.district, b."averageRating", b."totalReviews",
             b.attributes, c.name as category_name
      FROM "Business" b
      LEFT JOIN "Category" c ON b."categoryId" = c.id
      WHERE (
        b.attributes->>'coverPhoto' IS NOT NULL
        OR b.attributes->'about' IS NOT NULL
      )
      AND EXISTS (
        SELECT 1 FROM "ExternalReview" er
        WHERE er."businessId" = b.id AND er.content IS NOT NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM "BusinessEmbedding" be WHERE be."businessId" = b.id
      )
      ${cursor ? `AND b.id > '${cursor}'` : ''}
      ORDER BY b.id ASC
      LIMIT ${BATCH_SIZE}
      ${!cursor && OFFSET > 0 ? `OFFSET ${OFFSET}` : ''}
    `);

    if (!businesses.length) { done = true; break; }

    // Her işletme için yorumları çek ve embed et
    const texts = [];
    const validBiz = [];

    for (const biz of businesses) {
      const reviews = await prisma.externalReview.findMany({
        where:   { businessId: biz.id, content: { not: null } },
        select:  { id: true, content: true, publishedAt: true, ownerReply: true },
        orderBy: { publishedAt: 'asc' },
        take:    50,
      });

      const selected     = selectReviews(reviews);
      const ownerReplies = selected.map(r => r.ownerReply).filter(Boolean);
      const bizObj = {
        ...biz,
        attributes: typeof biz.attributes === 'string' ? JSON.parse(biz.attributes) : biz.attributes,
        category: { name: biz.category_name },
      };

      texts.push(buildBizText(bizObj, selected, ownerReplies));
      validBiz.push(biz);
    }

    // Batch embed
    try {
      const embeddings = await fetchEmbeddings(texts);
      for (let i = 0; i < validBiz.length; i++) {
        await upsertEmbedding(validBiz[i].id, embeddings[i]);
      }
      stats.processed += validBiz.length;
    } catch (e) {
      // Hata olursa tek tek dene
      for (let i = 0; i < validBiz.length; i++) {
        try {
          const emb = await fetchEmbeddings([texts[i]]);
          await upsertEmbedding(validBiz[i].id, emb[0]);
          stats.processed++;
        } catch (e2) {
          logFailed(validBiz[i].id, e2.message);
          stats.errors++;
        }
      }
    }

    cursor = businesses[businesses.length - 1].id;
    setState(stateKey, cursor);

    if (LIMIT > 0 && stats.processed >= LIMIT) done = true;
  }

  clearInterval(dashTimer);
  dashboard();

  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);
  console.log(`\n\n✅ Tamamlandı!`);
  console.log(`   İşlenen : ${stats.processed.toLocaleString()}`);
  console.log(`   Hata    : ${stats.errors}`);
  console.log(`   Süre    : ${fmtDuration(parseFloat(elapsed))}`);

  await prisma.$disconnect();
  qdb.close();
}

main().catch(async e => {
  console.error('\n❌ Fatal hata:', e);
  await prisma.$disconnect();
  process.exit(1);
});
