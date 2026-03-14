'use strict';
const { PrismaClient } = require('@prisma/client');
const Database = require('better-sqlite3');
const path = require('path');
const p = new PrismaClient();

const pct  = (n, t) => t > 0 ? `${((n / t) * 100).toFixed(1)}%` : '0%';
const fmt  = n => Number(n).toLocaleString('tr-TR');
const line = (label, value, extra = '') => {
  const l = (label + ' ').padEnd(26, '.');
  const v = String(value).padStart(10);
  console.log(`  ${l} ${v}${extra ? '  ' + extra : ''}`);
};
const sep = () => console.log('  ' + '─'.repeat(62));
const hdr = (icon, title) => {
  console.log(`\n┌${'─'.repeat(65)}┐`);
  console.log(`│  ${icon}  ${title.padEnd(61)}│`);
  console.log(`└${'─'.repeat(65)}┘`);
};
const bar = (val, max, w = 28) => '█'.repeat(Math.max(1, Math.round((val / (max || 1)) * w)));
const pb  = (done, total, w = 32) => {
  const r = total > 0 ? Math.min(done / total, 1) : 0;
  const f = Math.round(r * w);
  return `[${'█'.repeat(f)}${'░'.repeat(w - f)}] ${(r * 100).toFixed(1)}%`;
};

function getQueue(dbPath) {
  try {
    const db = new Database(dbPath, { readonly: true });
    const rows = db.prepare('SELECT status, COUNT(*) as c FROM jobs GROUP BY status').all();
    let recentDone = 0;
    try { recentDone = db.prepare("SELECT COUNT(*) as c FROM jobs WHERE status='done' AND done_at > datetime('now','-1 hour')").get()?.c || 0; } catch {}
    let failedCities = [];
    try { failedCities = db.prepare("SELECT city, COUNT(*) as c FROM jobs WHERE status='failed' AND city IS NOT NULL GROUP BY city ORDER BY c DESC LIMIT 5").all(); } catch {}
    db.close();
    const s = { pending: 0, done: 0, failed: 0, running: 0 };
    for (const r of rows) s[r.status] = Number(r.c);
    s.recentDone = Number(recentDone);
    s.failedCities = failedCities;
    return s;
  } catch { return null; }
}

async function main() {
  const t0 = Date.now();

  console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║            TECRÜBELERIM — KAPSAMLI DURUM RAPORU                  ║');
  console.log(`║            ${new Date().toLocaleString('tr-TR').padEnd(57)}║`);
  console.log('╚═══════════════════════════════════════════════════════════════════╝');

  // ── 1. SCRAPER QUEUE ──────────────────────────────────────────────────────
  hdr('🔄', 'SCRAPER QUEUE DURUMU');

  const detailQ = getQueue(path.join(__dirname, 'memory/detail-queue.db'));
  const reviewQ = getQueue(path.join(__dirname, 'memory/review-queue.db'));

  for (const [lbl, q] of [['Detail Scraper', detailQ], ['Review Scraper', reviewQ]]) {
    if (!q) { console.log(`\n  ${lbl}: queue bulunamadı`); continue; }
    const total = q.pending + q.done + q.failed + q.running;
    const hizSaat = q.recentDone;
    const kalanDk = hizSaat > 0 ? Math.round(q.pending / (hizSaat / 60)) : null;
    console.log(`\n  ${lbl}:`);
    console.log(`    ${pb(q.done, total)}`);
    line('  Tamamlanan',   fmt(q.done), `/ ${fmt(total)}`);
    line('  Bekleyen',     fmt(q.pending));
    line('  Hatalı',       fmt(q.failed));
    line('  Hız (son 1s)', fmt(hizSaat) + ' iş/saat');
    if (kalanDk !== null) {
      const bitis = new Date(Date.now() + kalanDk * 60000);
      line('  Tahmini bitiş', `~${(kalanDk/60).toFixed(1)} saat`, bitis.toLocaleString('tr-TR'));
    }
    if (q.failedCities?.length) {
      console.log(`    En çok hatalı iller:`);
      for (const r of q.failedCities) console.log(`      ${(r.city||'?').padEnd(16)}: ${r.c}`);
    }
  }

  // ── 2. İŞLETME VERİ KALİTESİ ─────────────────────────────────────────────
  hdr('🏢', 'İŞLETME VERİ KALİTESİ');

  const [
    totalB, activeB, withPhone, withWeb, withCoord, withPid, withHours,
    withRating, withCover, withPhotos, withAbout,
    dupPhones, suspRating, coverNoAbout,
    claimStats, cityStats, topRated,
  ] = await Promise.all([
    p.business.count(),
    p.business.count({ where: { isActive: true, isDeleted: false } }),
    p.business.count({ where: { phoneNumber: { not: null } } }),
    p.business.count({ where: { website: { not: null } } }),
    p.business.count({ where: { latitude: { not: null } } }),
    p.business.count({ where: { googlePlaceId: { not: null } } }),
    p.openingHours.groupBy({ by: ['businessId'] }).then(r => r.length),
    p.business.count({ where: { averageRating: { gt: 0 } } }),
    p.$queryRawUnsafe(`SELECT COUNT(*) as c FROM "Business" WHERE attributes->>'coverPhoto' IS NOT NULL`).then(r=>Number(r[0].c)),
    p.$queryRawUnsafe(`SELECT COUNT(*) as c FROM "Business" WHERE jsonb_array_length(COALESCE((attributes->'photos')::jsonb,'[]'::jsonb))>0`).then(r=>Number(r[0].c)).catch(()=>0),
    p.$queryRawUnsafe(`SELECT COUNT(*) as c FROM "Business" WHERE attributes->'about' IS NOT NULL`).then(r=>Number(r[0].c)),
    p.$queryRawUnsafe(`SELECT COUNT(*) as c FROM (SELECT "phoneNumber" FROM "Business" WHERE "phoneNumber" IS NOT NULL GROUP BY "phoneNumber" HAVING COUNT(*)>1) t`).then(r=>Number(r[0].c)).catch(()=>0),
    p.$queryRawUnsafe(`SELECT COUNT(*) as c FROM "Business" WHERE "averageRating">=4.9 AND "totalReviews" BETWEEN 1 AND 3`).then(r=>Number(r[0].c)).catch(()=>0),
    p.$queryRawUnsafe(`SELECT COUNT(*) as c FROM "Business" WHERE attributes->>'coverPhoto' IS NOT NULL AND attributes->'about' IS NULL`).then(r=>Number(r[0].c)).catch(()=>0),
    p.business.groupBy({ by: ['claimStatus'], _count: true }),
    p.business.groupBy({ by: ['city'], _count: { id: true }, orderBy: { _count: { id: 'desc' } }, take: 10 }),
    p.business.findMany({ where: { averageRating: { gt: 4.5 }, totalReviews: { gt: 10 } }, select: { name: true, city: true, averageRating: true, totalReviews: true }, orderBy: [{ averageRating: 'desc' },{ totalReviews: 'desc' }], take: 5 }),
  ]);

  console.log('');
  line('Toplam işletme',     fmt(totalB));
  line('Aktif',              fmt(activeB),     `(${pct(activeB,totalB)})`);
  sep();
  line('Telefon dolu',       fmt(withPhone),   `(${pct(withPhone,totalB)})`);
  line('Website dolu',       fmt(withWeb),     `(${pct(withWeb,totalB)})`);
  line('Koordinat var',      fmt(withCoord),   `(${pct(withCoord,totalB)})`);
  line('Google PlaceID',     fmt(withPid),     `(${pct(withPid,totalB)})`);
  line('Çalışma saati',      fmt(withHours),   `(${pct(withHours,totalB)})`);
  line('Rating var',         fmt(withRating),  `(${pct(withRating,totalB)})`);
  line('Kapak fotoğrafı',    fmt(withCover),   `(${pct(withCover,totalB)})`);
  line('Galeri fotoğrafı',   fmt(withPhotos),  `(${pct(withPhotos,totalB)})`);
  line('Hakkında bilgisi',   fmt(withAbout),   `(${pct(withAbout,totalB)})`);
  sep();
  console.log('  ⚠️  VERİ KALİTESİ UYARILARI:');
  line('  Duplike telefon',        fmt(dupPhones),     dupPhones > 0 ? '← kontrol et' : '✓ temiz');
  line('  Şüpheli rating',         fmt(suspRating),    '(4.9+ ama ≤3 yorum)');
  line('  Cover var / about yok',  fmt(coverNoAbout),  '← scraper devam ediyor');

  console.log('\n  Claim durumu:');
  for (const r of claimStats)
    console.log(`    ${(r.claimStatus||'-').padEnd(14)}: ${fmt(r._count)}`);

  console.log('\n  En kalabalık 10 şehir:');
  const maxC = cityStats[0]?._count.id || 1;
  for (const r of cityStats)
    console.log(`    ${(r.city||'?').padEnd(16)} ${bar(r._count.id, maxC).padEnd(24)} ${fmt(r._count.id)}`);

  console.log('\n  En yüksek puanlı 5 işletme (10+ yorum):');
  for (const r of topRated)
    console.log(`    ⭐${r.averageRating?.toFixed(1)}  ${(r.name||'?').substring(0,30).padEnd(30)} (${r.city}) — ${r.totalReviews} yorum`);

  // ── 3. KATEGORİ ANALİZİ ───────────────────────────────────────────────────
  hdr('📂', 'KATEGORİ ANALİZİ');

  const catData = await p.$queryRawUnsafe(`
    SELECT c.name as cat, COUNT(b.id) as total,
      COUNT(b."phoneNumber") as with_phone, COUNT(b.website) as with_web,
      ROUND(AVG(b."averageRating")::numeric,2) as avg_r, SUM(b."totalReviews") as total_rev
    FROM "Business" b JOIN "Category" c ON b."categoryId"=c.id
    GROUP BY c.id,c.name ORDER BY total DESC LIMIT 12
  `).catch(()=>[]);

  if (catData.length) {
    console.log('');
    console.log(`  ${'Kategori'.padEnd(28)} ${'İşletme'.padStart(8)} ${'Tel%'.padStart(6)} ${'Web%'.padStart(6)} ${'Rating'.padStart(7)} ${'Yorum'.padStart(9)}`);
    sep();
    for (const r of catData) {
      const t = Number(r.total);
      console.log(`  ${(r.cat||'?').substring(0,27).padEnd(28)} ${fmt(t).padStart(8)} ${pct(Number(r.with_phone),t).padStart(6)} ${pct(Number(r.with_web),t).padStart(6)} ${(r.avg_r?Number(r.avg_r).toFixed(1):'-').padStart(7)} ${fmt(r.total_rev).padStart(9)}`);
    }
  }

  // ── 4. COĞRAFİ ANALİZ ─────────────────────────────────────────────────────
  hdr('🗺️', 'COĞRAFİ ANALİZ — İL BAZINDA VERİ TAMAMLANMASI');

  const cityComp = await p.$queryRawUnsafe(`
    SELECT city, COUNT(*) as total,
      COUNT("phoneNumber") as ph, COUNT(website) as wb,
      COUNT(CASE WHEN "averageRating">0 THEN 1 END) as rt,
      COUNT(CASE WHEN attributes->>'coverPhoto' IS NOT NULL THEN 1 END) as cp,
      COUNT(CASE WHEN latitude IS NULL THEN 1 END) as no_coord
    FROM "Business" WHERE "isActive"=true
    GROUP BY city ORDER BY total DESC LIMIT 20
  `).catch(()=>[]);

  if (cityComp.length) {
    console.log('');
    console.log(`  ${'İl'.padEnd(16)} ${'Toplam'.padStart(7)} ${'Tel%'.padStart(6)} ${'Web%'.padStart(6)} ${'Rat%'.padStart(6)} ${'Foto%'.padStart(6)} ${'KoordYok'.padStart(9)}`);
    sep();
    for (const r of cityComp) {
      const t = Number(r.total);
      console.log(`  ${(r.city||'?').padEnd(16)} ${fmt(t).padStart(7)} ${pct(Number(r.ph),t).padStart(6)} ${pct(Number(r.wb),t).padStart(6)} ${pct(Number(r.rt),t).padStart(6)} ${pct(Number(r.cp),t).padStart(6)} ${fmt(r.no_coord).padStart(9)}`);
    }
  }

  // ── 5. GOOGLE YORUMLARI ───────────────────────────────────────────────────
  hdr('💬', 'GOOGLE YORUMLARI');

  const [
    totalRev, withCont, withPhotoRev, withReply, withLevel,
    ratingDist, monthDist, topRev, avgPerBiz, avgLen, catRevStats,
  ] = await Promise.all([
    p.externalReview.count(),
    p.externalReview.count({ where: { content: { not: null } } }),
    p.externalReview.count({ where: { NOT: { photos: { equals: [] } } } }),
    p.externalReview.count({ where: { ownerReply: { not: null } } }),
    p.externalReview.count({ where: { authorLevel: { not: null } } }),
    p.$queryRawUnsafe(`SELECT FLOOR(rating) as stars, COUNT(*) as cnt FROM "ExternalReview" WHERE rating IS NOT NULL GROUP BY stars ORDER BY stars DESC`),
    p.$queryRawUnsafe(`SELECT TO_CHAR(DATE_TRUNC('month',"scrapedAt"),'Mon YYYY') as month, COUNT(*) as cnt FROM "ExternalReview" GROUP BY DATE_TRUNC('month',"scrapedAt") ORDER BY DATE_TRUNC('month',"scrapedAt") DESC LIMIT 6`),
    p.externalReview.groupBy({ by: ['businessId'], _count: { id: true }, orderBy: { _count: { id: 'desc' } }, take: 5 })
      .then(async rows => Promise.all(rows.map(async r => {
        const biz = await p.business.findUnique({ where: { id: r.businessId }, select: { name: true, city: true } });
        return { name: biz?.name, city: biz?.city, count: r._count.id };
      }))),
    p.$queryRawUnsafe(`SELECT ROUND(AVG(cnt),1) as avg FROM (SELECT COUNT(*) as cnt FROM "ExternalReview" GROUP BY "businessId") t`).then(r=>r[0]?.avg||0),
    p.$queryRawUnsafe(`SELECT ROUND(AVG(LENGTH(content)),0) as avg FROM "ExternalReview" WHERE content IS NOT NULL`).then(r=>Number(r[0]?.avg||0)).catch(()=>0),
    p.$queryRawUnsafe(`
      SELECT c.name as cat, COUNT(e.id) as cnt,
        ROUND(AVG(e.rating)::numeric,2) as avg_r,
        COUNT(CASE WHEN jsonb_array_length(COALESCE(e.photos::jsonb,'[]'::jsonb))>0 THEN 1 END) as with_photo
      FROM "ExternalReview" e
      JOIN "Business" b ON e."businessId"=b.id
      JOIN "Category" c ON b."categoryId"=c.id
      GROUP BY c.name ORDER BY cnt DESC LIMIT 8
    `).catch(()=>[]),
  ]);

  console.log('');
  line('Toplam yorum',          fmt(totalRev));
  line('Metin içeren',          fmt(withCont),      `(${pct(withCont,totalRev)})`);
  line('Fotoğraflı',            fmt(withPhotoRev),  `(${pct(withPhotoRev,totalRev)})`);
  line('İşletme yanıtlı',       fmt(withReply),     `(${pct(withReply,totalRev)})`);
  line('Yerel Rehber',          fmt(withLevel),     `(${pct(withLevel,totalRev)})`);
  line('Ort. yorum/işletme',    Number(avgPerBiz).toFixed(1));
  line('Ort. içerik uzunluğu',  fmt(avgLen) + ' karakter');

  console.log('\n  Puan dağılımı:');
  const maxR = Math.max(...ratingDist.map(r=>Number(r.cnt)));
  for (const r of ratingDist)
    console.log(`    ${r.stars}⭐  ${bar(Number(r.cnt),maxR).padEnd(30)} ${fmt(r.cnt)}`);

  console.log('\n  Aylık çekim (son 6 ay):');
  const maxM = Math.max(...monthDist.map(r=>Number(r.cnt)));
  for (const r of monthDist)
    console.log(`    ${String(r.month).padEnd(10)} ${bar(Number(r.cnt),maxM).padEnd(30)} ${fmt(r.cnt)}`);

  console.log('\n  En çok yorum olan 5 işletme:');
  for (const r of topRev)
    console.log(`    ${(r.name||'?').substring(0,32).padEnd(32)} (${(r.city||'?').padEnd(12)}) ${r.count} yorum`);

  if (catRevStats.length) {
    console.log('\n  Kategori bazında yorum istatistikleri:');
    console.log(`  ${'Kategori'.padEnd(28)} ${'Yorum'.padStart(8)} ${'Ort.Puan'.padStart(9)} ${'Fotoğraflı%'.padStart(12)}`);
    sep();
    for (const r of catRevStats)
      console.log(`  ${(r.cat||'?').substring(0,27).padEnd(28)} ${fmt(r.cnt).padStart(8)} ${Number(r.avg_r).toFixed(1).padStart(9)} ${pct(Number(r.with_photo),Number(r.cnt)).padStart(12)}`);
  }

  // ── 6. TAHMİN MOTORU ──────────────────────────────────────────────────────
  hdr('🔮', 'TAHMİN MOTORU');
  console.log('');

  if (reviewQ?.recentDone > 0) {
    const hiz1  = reviewQ.recentDone;
    const hiz2  = hiz1 * 2;
    const bit1  = new Date(Date.now() + reviewQ.pending/hiz1 * 3600000);
    const bit2  = new Date(Date.now() + reviewQ.pending/hiz2 * 3600000);
    line('Review hız (1 PC)',    fmt(hiz1) + ' iş/saat');
    line('Review hız (2 PC)',    fmt(hiz2) + ' iş/saat', '(tahmini)');
    line('Bitiş — 1 PC',        `~${(reviewQ.pending/hiz1).toFixed(1)} saat`, bit1.toLocaleString('tr-TR'));
    line('Bitiş — 2 PC',        `~${(reviewQ.pending/hiz2).toFixed(1)} saat`, bit2.toLocaleString('tr-TR'));
    sep();
    const avgYorumPerBiz = reviewQ.done > 0 ? totalRev / reviewQ.done : 0;
    const toplamTahmini = Math.round(totalRev + reviewQ.pending * avgYorumPerBiz);
    line('Ort. yorum/çekilen',   avgYorumPerBiz.toFixed(1));
    line('Günlük çekim (1 PC)',  fmt(Math.round(hiz1*24)) + ' iş');
    line('Tahmini toplam yorum', fmt(toplamTahmini), '(bitince)');
  } else {
    console.log('  Review scraper şu an çalışmıyor — hız hesaplanamadı.');
  }

  if (detailQ?.recentDone > 0) {
    sep();
    const dh   = detailQ.recentDone;
    const dbit = new Date(Date.now() + detailQ.pending/dh * 3600000);
    line('Detail hız',           fmt(dh) + ' iş/saat');
    line('Detail bitiş',         `~${(detailQ.pending/dh).toFixed(1)} saat`, dbit.toLocaleString('tr-TR'));
  }

  // ── 7. VERİTABANI BOYUTU ──────────────────────────────────────────────────
  hdr('💾', 'VERİTABANI BOYUTU');
  console.log('');

  const dbSizes  = await p.$queryRawUnsafe(`SELECT relname as t, pg_size_pretty(pg_total_relation_size(relid)) as total, pg_size_pretty(pg_relation_size(relid)) as data, pg_size_pretty(pg_indexes_size(relid)) as idx FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 10`);
  const dbTotal  = await p.$queryRawUnsafe(`SELECT pg_size_pretty(pg_database_size(current_database())) as size`);

  console.log(`  ${'Tablo'.padEnd(26)} ${'Toplam'.padStart(10)} ${'Veri'.padStart(10)} ${'Index'.padStart(10)}`);
  sep();
  for (const r of dbSizes)
    console.log(`  ${(r.t||'').padEnd(26)} ${String(r.total).padStart(10)} ${String(r.data).padStart(10)} ${String(r.idx).padStart(10)}`);
  sep();
  console.log(`  ${'TOPLAM'.padEnd(26)} ${String(dbTotal[0].size).padStart(10)}`);

  // ── 8. EMBEDDING PIPELINE ─────────────────────────────────────────────────
  hdr('🧠', 'EMBEDDING PIPELINE');
  console.log('');

  const [
    totalEmbed, totalEmbedable,
    embedModelDist, embedLastHour, embedOldest, embedNewest,
  ] = await Promise.all([
    p.reviewEmbedding.count(),
    p.externalReview.count({ where: { content: { not: null } } }),
    p.$queryRawUnsafe(`SELECT model, COUNT(*) as cnt FROM "ReviewEmbedding" GROUP BY model ORDER BY cnt DESC`).catch(()=>[]),
    p.$queryRawUnsafe(`SELECT COUNT(*) as c FROM "ReviewEmbedding" WHERE "createdAt" > NOW() - INTERVAL '1 hour'`).then(r=>Number(r[0]?.c||0)).catch(()=>0),
    p.$queryRawUnsafe(`SELECT "createdAt" FROM "ReviewEmbedding" ORDER BY "createdAt" ASC  LIMIT 1`).then(r=>r[0]?.createdAt).catch(()=>null),
    p.$queryRawUnsafe(`SELECT "createdAt" FROM "ReviewEmbedding" ORDER BY "createdAt" DESC LIMIT 1`).then(r=>r[0]?.createdAt).catch(()=>null),
  ]);

  const embedRemaining = totalEmbedable - totalEmbed;
  const embedSpeedHr   = embedLastHour;
  const embedEtaMs     = embedSpeedHr > 0 ? (embedRemaining / embedSpeedHr) * 3600000 : null;
  const embedEtaDate   = embedEtaMs ? new Date(Date.now() + embedEtaMs) : null;

  console.log(`    ${pb(totalEmbed, totalEmbedable)}`);
  console.log('');
  line('Embed edilmiş',       fmt(totalEmbed),       `/ ${fmt(totalEmbedable)} (embed edilebilir)`);
  line('Kalan',               fmt(embedRemaining),   `(${pct(embedRemaining, totalEmbedable)})`);
  line('Hız (son 1 saat)',    fmt(embedSpeedHr) + ' embed/saat');
  if (embedEtaDate) {
    line('Tahmini bitiş',     `~${(embedEtaMs/3600000).toFixed(1)} saat`, embedEtaDate.toLocaleString('tr-TR'));
  } else {
    line('Tahmini bitiş',     'pipeline çalışmıyor');
  }
  if (embedOldest) line('İlk embed',  new Date(embedOldest).toLocaleString('tr-TR'));
  if (embedNewest) line('Son embed',  new Date(embedNewest).toLocaleString('tr-TR'));

  // embed-queue.db'den failed sayısı
  try {
    const eqdb = new Database(path.join(__dirname, 'embed-queue.db'), { readonly: true });
    const failedEmbed = eqdb.prepare('SELECT COUNT(*) as c FROM failed').get()?.c || 0;
    const cursorRows  = eqdb.prepare('SELECT key, value FROM progress').all();
    eqdb.close();
    line('Hatalı embed',      fmt(failedEmbed), failedEmbed > 0 ? '← kontrol et' : '✓ temiz');
    if (cursorRows.length) {
      console.log('\n  Cursor durumu (kaldığı yer):');
      for (const r of cursorRows)
        console.log(`    ${r.key}: ${String(r.value).substring(0, 40)}`);
    }
  } catch { /* embed-queue.db henüz yok */ }

  if (embedModelDist.length) {
    console.log('\n  Model dağılımı:');
    for (const r of embedModelDist)
      console.log(`    ${(r.model||'?').padEnd(24)}: ${fmt(r.cnt)}`);
  }

  // BusinessEmbedding
  const [bizEmbedTotal, bizTotal] = await Promise.all([
    p.businessEmbedding.count().catch(()=>0),
    p.business.count(),
  ]);
  sep();
  line('BusinessEmbedding',   fmt(bizEmbedTotal),  `/ ${fmt(bizTotal)} işletme (${pct(bizEmbedTotal, bizTotal)})`);

  // ── 9. PLATFORM ───────────────────────────────────────────────────────────
  hdr('🌐', 'PLATFORM');
  console.log('');

  const [platRev, totalUser, totalPhoto] = await Promise.all([
    p.review.count(), p.user.count(), p.businessPhoto.count(),
  ]);
  line('Platform yorumu',   fmt(platRev));
  line('Kayıtlı kullanıcı', fmt(totalUser));
  line('İşletme fotoğrafı', fmt(totalPhoto));

  const elapsed = ((Date.now()-t0)/1000).toFixed(1);
  console.log(`\n╔═══════════════════════════════════════════════════════════════════╗`);
  console.log(`║  Rapor süresi: ${(elapsed+' sn').padEnd(53)}║`);
  console.log(`║  ${new Date().toLocaleString('tr-TR').padEnd(67)}║`);
  console.log(`╚═══════════════════════════════════════════════════════════════════╝\n`);
}

main().catch(e => { console.error('HATA:', e.message); }).finally(() => p.$disconnect());
