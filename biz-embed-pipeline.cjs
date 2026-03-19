const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const EMBED_MODEL = process.env.BIZ_EMBED_MODEL || 'bge-m3';
const BATCH_SIZE = parseInt(process.env.BIZ_EMBED_BATCH_SIZE || '128', 10);

const args = Object.fromEntries(
  process.argv.slice(2).map(arg => {
    const [k, v] = arg.replace(/^--/, '').split('=');
    return [k, v ?? '1'];
  })
);

const OFFSET = parseInt(args.offset ?? '0', 10);
const LIMIT = parseInt(args.limit ?? '0', 10);

const LOCK_FILE = path.join(__dirname, 'biz-embed-pipeline.lock');
const QUEUE_DB = path.join(__dirname, 'biz-embed-queue.db');
const LOG_FILE = path.join(__dirname, 'biz-embed-pipeline.log');

if (fs.existsSync(LOCK_FILE)) {
  const pid = fs.readFileSync(LOCK_FILE, 'utf8').trim();
  console.log(`Zaten calisiyor (PID: ${pid}), atlaniyor.`);
  process.exit(0);
}

fs.writeFileSync(LOCK_FILE, String(process.pid));

const cleanLock = () => {
  try { fs.unlinkSync(LOCK_FILE); } catch {}
};

process.on('SIGINT', async () => {
  cleanLock();
  try { await prisma.$disconnect(); } catch {}
  process.exit(0);
});

process.on('uncaughtException', async (e) => {
  cleanLock();
  console.error(e);
  try { await prisma.$disconnect(); } catch {}
  process.exit(1);
});

process.on('unhandledRejection', async (e) => {
  cleanLock();
  console.error(e);
  try { await prisma.$disconnect(); } catch {}
  process.exit(1);
});

const qdb = new Database(QUEUE_DB);
qdb.exec(`
  CREATE TABLE IF NOT EXISTS progress (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS failed (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    businessId TEXT NOT NULL,
    error TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const getState = (k, d) => {
  const row = qdb.prepare('SELECT value FROM progress WHERE key=?').get(k);
  return row ? JSON.parse(row.value) : d;
};

const setState = (k, v) => {
  qdb.prepare(`
    INSERT OR REPLACE INTO progress(key, value)
    VALUES(?, ?)
  `).run(k, JSON.stringify(v));
};

const logFailed = (businessId, error) => {
  qdb.prepare(`
    INSERT INTO failed(businessId, error)
    VALUES(?, ?)
  `).run(businessId, String(error || 'unknown'));
};

function logLine(text) {
  const line = `[${new Date().toISOString()}] ${text}\n`;
  try { fs.appendFileSync(LOG_FILE, line, 'utf8'); } catch {}
}

function fmtDuration(sec) {
  if (!isFinite(sec) || sec < 0) return '?';
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor((sec / 3600) % 24);
  const d = Math.floor(sec / 86400);

  const parts = [];
  if (d) parts.push(`${d}g`);
  if (h) parts.push(`${h}sa`);
  if (m) parts.push(`${m}dk`);
  if (s || parts.length === 0) parts.push(`${s}sn`);
  return parts.join(' ');
}

function normalizeText(value) {
  if (!value) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function safeJson(input, fallback = {}) {
  if (!input) return fallback;
  if (typeof input === 'object') return input;
  try { return JSON.parse(input); } catch { return fallback; }
}

function pickAttributesText(attributes) {
  const a = safeJson(attributes, {});
  const out = [];

  const maybePush = (v) => {
    if (!v) return;
    if (Array.isArray(v)) {
      for (const x of v) {
        const t = normalizeText(x);
        if (t) out.push(t);
      }
      return;
    }
    const t = normalizeText(v);
    if (t) out.push(t);
  };

  maybePush(a.about);
  maybePush(a.shortDescription);
  maybePush(a.features);
  maybePush(a.tags);
  maybePush(a.services);
  maybePush(a.highlights);
  maybePush(a.ambience);
  maybePush(a.priceRange);
  maybePush(a.cuisine);
  maybePush(a.specialties);

  return [...new Set(out)].join(', ');
}

function buildBizText(biz, reviews, ownerReplies) {
  const kategori = normalizeText(biz?.category?.name || biz.category_name || '');
  const lokasyon = [biz.district, biz.city].map(normalizeText).filter(Boolean).join(', ');
  const ozellikler = pickAttributesText(biz.attributes);
  const rating = biz.averageRating ? `${biz.averageRating} puan` : '';
  const yorumSayisi = biz.totalReviews ? `${biz.totalReviews} yorum` : '';
  const fiyat = normalizeText(safeJson(biz.attributes, {}).priceRange || '');

  const baseparts = [
    normalizeText(biz.name),
    kategori,
    lokasyon,
    ozellikler,
    rating,
    yorumSayisi,
    fiyat
  ].filter(Boolean);

  const header = baseparts.join(' | ');

  const reviewTexts = reviews.map(r => normalizeText(r.content)).filter(Boolean);
  const replyTexts = ownerReplies.map(r => normalizeText(r)).filter(Boolean);

  if (reviews.length >= 5) {
    const yorumlar = reviewTexts.length > 0
      ? ' | Yorumlar: ' + reviewTexts.join(' / ')
      : '';
    return header + yorumlar;
  } else if (reviews.length >= 1) {
    const yorumlar = reviewTexts.length > 0
      ? ' | Kullanicilar diyor ki: ' + reviewTexts.join(' / ')
      : '';
    const replies = replyTexts.length > 0
      ? ' | Isletme yaniti: ' + replyTexts.join(' / ')
      : '';
    const tekrar = ` | ${kategori || 'Isletme'} uzmanligi, ${lokasyon || 'yerel'} lokasyonu`;
    return header + yorumlar + replies + tekrar;
  } else {
    return header + ` | ${lokasyon} ${kategori}`;
  }
}

async function fetchEmbeddings(texts) {
  const clean = texts.map(t => {
    const x = normalizeText(t);
    return x.length > 0 ? x : 'isletme';
  });

  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: clean
    })
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Ollama embed hatasi: ${res.status} ${txt}`);
  }

  const data = await res.json();

  if (!Array.isArray(data.embeddings)) {
    throw new Error('Ollama embeddings donmedi');
  }

  return data.embeddings;
}

async function upsertEmbedding(bizId, embedding) {
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error(`Gecersiz embedding: ${bizId}`);
  }

  const vec = '[' + embedding.join(',') + ']';

  await prisma.$executeRawUnsafe(`
    INSERT INTO "BusinessEmbedding" (
      id,
      "businessId",
      model,
      embedding,
      "createdAt",
      "updatedAt"
    )
    VALUES (
      gen_random_uuid()::text,
      $1,
      $2,
      $3::vector,
      now(),
      now()
    )
    ON CONFLICT ("businessId")
    DO UPDATE SET
      embedding = EXCLUDED.embedding,
      model = EXCLUDED.model,
      "updatedAt" = now()
  `, bizId, EMBED_MODEL, vec);
}

function renderProgress(stats) {
  const elapsed = (Date.now() - stats.startTime) / 1000;
  const speed = stats.processed / Math.max(elapsed, 1);

  process.stdout.write(
    `\r[${new Date().toLocaleTimeString('tr-TR')}] ` +
    `${stats.processed.toLocaleString()}/${stats.total != null ? stats.total.toLocaleString() : '?'} | ` +
    `${speed.toFixed(1)} biz/s | Hata: ${stats.errors}    `
  );
}

async function pingOllama() {
  const res = await fetch(`${OLLAMA_URL}/api/tags`);
  if (!res.ok) throw new Error('Ollama erisilemiyor');
}

async function fetchBusinesses(cursor) {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      b.id,
      b.name,
      b.city,
      b.district,
      b.attributes,
      b."averageRating",
      b."totalReviews",
      c.name as category_name
    FROM "Business" b
    LEFT JOIN "Category" c ON c.id = b."categoryId"
    WHERE (
      b.attributes->>'coverPhoto' IS NOT NULL
      OR b.attributes->'about' IS NOT NULL
      OR b.attributes->>'shortDescription' IS NOT NULL
    )
    AND EXISTS (
      SELECT 1
      FROM "ExternalReview" er
      WHERE er."businessId" = b.id
        AND er.content IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "BusinessEmbedding" be
      WHERE be."businessId" = b.id
    )
    ${cursor ? `AND b.id > '${cursor}'` : ''}
    ORDER BY b.id ASC
    LIMIT ${BATCH_SIZE}
    ${!cursor && OFFSET > 0 ? `OFFSET ${OFFSET}` : ''}
  `);

  return rows;
}

async function fetchReviewsForBusinesses(businessIds) {
  if (!businessIds.length) return [];

  const rows = await prisma.externalReview.findMany({
    where: {
      businessId: { in: businessIds },
      content: { not: null }
    },
    select: {
      businessId: true,
      content: true,
      publishedAt: true,
      ownerReply: true
    },
    orderBy: {
      publishedAt: 'asc'
    }
  });

  return rows;
}

function groupReviewsByBusiness(rows) {
  const reviewMap = new Map();

  for (const row of rows) {
    if (!reviewMap.has(row.businessId)) {
      reviewMap.set(row.businessId, []);
    }

    const arr = reviewMap.get(row.businessId);
    if (arr.length < 50) {
      arr.push(row);
    }
  }

  return reviewMap;
}

async function main() {
  const stats = {
    total: null,
    processed: 0,
    errors: 0,
    startTime: Date.now()
  };

  console.log(`\n🚀 tecrubelerim.com — Business Embedding Pipeline`);
  console.log(`   Model:      ${EMBED_MODEL}`);
  console.log(`   Batch size: ${BATCH_SIZE}`);
  console.log(`   Offset:     ${OFFSET}`);
  console.log(`   Limit:      ${LIMIT || '(tümü)'}`);
  console.log(`   Queue DB:   ${QUEUE_DB}\n`);

  try {
    await pingOllama();
    console.log('✅ Ollama bağlantısı OK');
  } catch {
    console.error('❌ Ollama çalışmıyor. Lütfen başlatın:');
    console.error('   ollama serve');
    process.exit(1);
  }

  console.log('📊 Toplam sayı hesaplanmıyor, uygun işletmeler taranarak işlenecek...');

  const stateKey = `cursor_off${OFFSET}_lim${LIMIT}`;
  let cursor = getState(stateKey, null);
  let done = false;

  while (!done) {
    const businesses = await fetchBusinesses(cursor);

    if (!businesses.length) {
      done = true;
      break;
    }

    const bizIds = businesses.map(b => b.id);
    const allReviews = await fetchReviewsForBusinesses(bizIds);
    const reviewMap = groupReviewsByBusiness(allReviews);

    const texts = [];
    const validBiz = [];

    for (const biz of businesses) {
      const reviews = reviewMap.get(biz.id) || [];
      if (!reviews.length) continue;

      const selected = reviews.filter(r => normalizeText(r.content));
      if (!selected.length) continue;

      const ownerReplies = selected
        .map(r => r.ownerReply)
        .filter(Boolean);

      const bizObj = {
        ...biz,
        category: { name: biz.category_name }
      };

      texts.push(buildBizText(bizObj, selected, ownerReplies));
      validBiz.push(biz);
    }

    if (validBiz.length > 0) {
      try {
        const embeddings = await fetchEmbeddings(texts);

        if (!Array.isArray(embeddings) || embeddings.length !== validBiz.length) {
          throw new Error(`Embedding sayisi uyusmuyor: texts=${validBiz.length}, embeddings=${embeddings?.length ?? 0}`);
        }

        for (let i = 0; i < validBiz.length; i++) {
          await upsertEmbedding(validBiz[i].id, embeddings[i]);
        }

        stats.processed += validBiz.length;
      } catch (e) {
        logLine(`Batch hata: ${e.message}`);

        for (let i = 0; i < validBiz.length; i++) {
          try {
            const emb = await fetchEmbeddings([texts[i]]);
            await upsertEmbedding(validBiz[i].id, emb[0]);
            stats.processed++;
          } catch (e2) {
            logFailed(validBiz[i].id, e2.message);
            logLine(`Tekli hata | businessId=${validBiz[i].id} | ${e2.message}`);
            stats.errors++;
          }
        }
      }
    }

    cursor = businesses[businesses.length - 1].id;
    setState(stateKey, cursor);

    renderProgress(stats);

    if (LIMIT > 0 && stats.processed >= LIMIT) {
      done = true;
      break;
    }
  }

  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);

  console.log(`\n\n✅ Tamamlandı!`);
  console.log(`   İşlenen : ${stats.processed.toLocaleString()}`);
  console.log(`   Hata    : ${stats.errors}`);
  console.log(`   Süre    : ${fmtDuration(parseFloat(elapsed))}`);

  await prisma.$disconnect();
  qdb.close();
  cleanLock();
}

main().catch(async (e) => {
  console.error('\n❌ Fatal:', e);
  logLine(`Fatal: ${e.message}`);
  try { await prisma.$disconnect(); } catch {}
  try { qdb.close(); } catch {}
  cleanLock();
  process.exit(1);
});