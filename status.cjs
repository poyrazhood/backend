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
const sep = () => console.log('  ' + '\u2500'.repeat(62));
const hdr = (icon, title) => {
  console.log(`\n\u250c${'\u2500'.repeat(65)}\u2510`);
  console.log(`\u2502  ${icon}  ${title.padEnd(61)}\u2502`);
  console.log(`\u2514${'\u2500'.repeat(65)}\u2518`);
};
const bar = (val, max, w = 28) => '\u2588'.repeat(Math.max(1, Math.round((val / (max || 1)) * w)));
const pb  = (done, total, w = 32) => {
  const r = total > 0 ? Math.min(done / total, 1) : 0;
  const f = Math.round(r * w);
  return `[${'\u2588'.repeat(f)}${'\u2591'.repeat(w - f)}] ${(r * 100).toFixed(1)}%`;
};

function getQueue(dbPath, tableName) {
  try {
    const db = new Database(dbPath, { readonly: true });
    const rows = db.prepare(`SELECT status, COUNT(*) as c FROM ${tableName} GROUP BY status`).all();
    const recentDone = db.prepare(`SELECT COUNT(*) as c FROM ${tableName} WHERE status='done' AND done_at > datetime('now','-1 hour')`).get()?.c || 0;
    db.close();
    const s = { pending: 0, done: 0, failed: 0, running: 0 };
    for (const r of rows) s[r.status] = Number(r.c);
    s.recentDone = Number(recentDone);
    return s;
  } catch { return null; }
}

async function main() {
  const t0 = Date.now();

  console.log('\n\u2554' + '\u2550'.repeat(67) + '\u2557');
  console.log('\u2551            TECRUBELERIM \u2014 DURUM RAPORU                           \u2551');
  console.log(`\u2551            ${new Date().toLocaleString('tr-TR').padEnd(57)}\u2551`);
  console.log('\u255a' + '\u2550'.repeat(67) + '\u255d');

  // 1. SCRAPER QUEUE
  hdr('🔄', 'SCRAPER QUEUE DURUMU');
  const detailQ = getQueue(path.join(__dirname, 'memory/detail-queue.db'), 'jobs');
  const reviewQ = getQueue(path.join(__dirname, 'memory/review-queue.db'), 'review_jobs');

  for (const [lbl, q] of [['Detail Scraper', detailQ], ['Review Scraper', reviewQ]]) {
    if (!q) { console.log(`\n  ${lbl}: queue bulunamadi`); continue; }
    const total   = q.pending + q.done + q.failed + q.running;
    const hizSaat = q.recentDone;
    const kalanDk = hizSaat > 0 ? Math.round(q.pending / (hizSaat / 60)) : null;
    console.log(`\n  ${lbl}:`);
    console.log(`    ${pb(q.done, total)}`);
    line('  Tamamlanan',    fmt(q.done),    `/ ${fmt(total)}`);
    line('  Bekleyen',      fmt(q.pending));
    line('  Hatali',        fmt(q.failed));
    line('  Hiz (son 1sa)', fmt(hizSaat) + ' is/saat');
    if (kalanDk !== null) {
      const bitis = new Date(Date.now() + kalanDk * 60000);
      line('  Tahmini bitis', `~${(kalanDk/60).toFixed(1)} saat`, bitis.toLocaleString('tr-TR'));
    }
  }

  // 2. ISLETME
  hdr('🏢', 'ISLETME VERİ KALİTESİ');
  const [
    totalB, activeB, withPhone, withWeb, withCoord, withPid, withHours,
    withRating, withCover, withPhotos, withAbout,
    dupPhones, suspRating, claimStats, cityStats,
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
    p.business.groupBy({ by: ['claimStatus'], _count: true }),
    p.business.groupBy({ by: ['city'], _count: { id: true }, orderBy: { _count: { id: 'desc' } }, take: 10 }),
  ]);

  console.log('');
  line('Toplam isletme',   fmt(totalB));
  line('Aktif',            fmt(activeB),    `(${pct(activeB,totalB)})`);
  sep();
  line('Telefon dolu',     fmt(withPhone),  `(${pct(withPhone,totalB)})`);
  line('Website dolu',     fmt(withWeb),    `(${pct(withWeb,totalB)})`);
  line('Koordinat var',    fmt(withCoord),  `(${pct(withCoord,totalB)})`);
  line('Google PlaceID',   fmt(withPid),    `(${pct(withPid,totalB)})`);
  line('Calisma saati',    fmt(withHours),  `(${pct(withHours,totalB)})`);
  line('Rating var',       fmt(withRating), `(${pct(withRating,totalB)})`);
  line('Kapak fotografi',  fmt(withCover),  `(${pct(withCover,totalB)})`);
  line('Galeri fotografi', fmt(withPhotos), `(${pct(withPhotos,totalB)})`);
  line('Hakkinda bilgisi', fmt(withAbout),  `(${pct(withAbout,totalB)})`);
  sep();
  line('Duplike telefon',  fmt(dupPhones),  dupPhones > 0 ? '<- kontrol et' : 'temiz');
  line('Suphe rating',     fmt(suspRating), '(4.9+ ama <=3 yorum)');

  console.log('\n  Claim durumu:');
  for (const r of claimStats)
    console.log(`    ${(r.claimStatus||'-').padEnd(14)}: ${fmt(r._count)}`);

  console.log('\n  En kalabalk 10 sehir:');
  const maxC = cityStats[0]?._count.id || 1;
  for (const r of cityStats)
    console.log(`    ${(r.city||'?').padEnd(16)} ${bar(r._count.id, maxC).padEnd(24)} ${fmt(r._count.id)}`);

  // 3. GOOGLE YORUMLARI
  hdr('💬', 'GOOGLE YORUMLARI');
  const [
    totalRev, withCont, withReply, withLevel,
    ratingDist, monthDist, avgPerBiz, avgLen,
  ] = await Promise.all([
    p.externalReview.count(),
    p.externalReview.count({ where: { content: { not: null } } }),
    p.externalReview.count({ where: { ownerReply: { not: null } } }),
    p.externalReview.count({ where: { authorLevel: { not: null } } }),
    p.$queryRawUnsafe(`SELECT FLOOR(rating) as stars, COUNT(*) as cnt FROM "ExternalReview" WHERE rating IS NOT NULL GROUP BY stars ORDER BY stars DESC`),
    p.$queryRawUnsafe(`SELECT TO_CHAR(DATE_TRUNC('month',"scrapedAt"),'Mon YYYY') as month, COUNT(*) as cnt FROM "ExternalReview" GROUP BY DATE_TRUNC('month',"scrapedAt") ORDER BY DATE_TRUNC('month',"scrapedAt") DESC LIMIT 6`),
    p.$queryRawUnsafe(`SELECT ROUND(AVG(cnt),1) as avg FROM (SELECT COUNT(*) as cnt FROM "ExternalReview" GROUP BY "businessId") t`).then(r=>r[0]?.avg||0),
    p.$queryRawUnsafe(`SELECT ROUND(AVG(LENGTH(content)),0) as avg FROM "ExternalReview" WHERE content IS NOT NULL`).then(r=>Number(r[0]?.avg||0)).catch(()=>0),
  ]);

  console.log('');
  line('Toplam yorum',         fmt(totalRev));
  line('Metin iceren',         fmt(withCont),   `(${pct(withCont,totalRev)})`);
  line('Isletme yanitli',      fmt(withReply),  `(${pct(withReply,totalRev)})`);
  line('Yerel Rehber',         fmt(withLevel),  `(${pct(withLevel,totalRev)})`);
  line('Ort. yorum/isletme',   Number(avgPerBiz).toFixed(1));
  line('Ort. icerik uzunlugu', fmt(avgLen) + ' karakter');

  console.log('\n  Puan dagilimi:');
  const maxR = Math.max(...ratingDist.map(r=>Number(r.cnt)));
  for (const r of ratingDist)
    console.log(`    ${r.stars}  ${bar(Number(r.cnt),maxR).padEnd(30)} ${fmt(r.cnt)}`);

  console.log('\n  Aylik cekim (son 6 ay):');
  const maxM = Math.max(...monthDist.map(r=>Number(r.cnt)));
  for (const r of monthDist)
    console.log(`    ${String(r.month).padEnd(10)} ${bar(Number(r.cnt),maxM).padEnd(30)} ${fmt(r.cnt)}`);

  // 4. EMBEDDING PIPELINE
  hdr('🧠', 'EMBEDDING PIPELINE');
  console.log('');

  const [totalEmbed, totalEmbedable, embedLastHour, embedNewest] = await Promise.all([
    p.reviewEmbedding.count(),
    p.externalReview.count({ where: { content: { not: null } } }),
    p.$queryRawUnsafe(`SELECT COUNT(*) as c FROM "ReviewEmbedding" WHERE "createdAt" > NOW() - INTERVAL '1 hour'`).then(r=>Number(r[0]?.c||0)).catch(()=>0),
    p.$queryRawUnsafe(`SELECT "createdAt" FROM "ReviewEmbedding" ORDER BY "createdAt" DESC LIMIT 1`).then(r=>r[0]?.createdAt).catch(()=>null),
  ]);

  const embedRemaining = totalEmbedable - totalEmbed;
  const embedEtaMs     = embedLastHour > 0 ? (embedRemaining / embedLastHour) * 3600000 : null;

  console.log(`    ${pb(totalEmbed, totalEmbedable)}`);
  console.log('');
  line('Embed edilmis',    fmt(totalEmbed),     `/ ${fmt(totalEmbedable)}`);
  line('Kalan',            fmt(embedRemaining), `(${pct(embedRemaining, totalEmbedable)})`);
  line('Hiz (son 1 saat)', fmt(embedLastHour) + ' embed/saat');
  line('Tahmini bitis',    embedEtaMs ? `~${(embedEtaMs/3600000).toFixed(1)} saat` : 'pipeline calısmiyor');
  if (embedNewest) line('Son embed', new Date(embedNewest).toLocaleString('tr-TR'));

  try {
    const eqdb = new Database(path.join(__dirname, 'embed-queue.db'), { readonly: true });
    const failedEmbed = eqdb.prepare('SELECT COUNT(*) as c FROM failed').get()?.c || 0;
    eqdb.close();
    line('Hatali embed', fmt(failedEmbed), failedEmbed > 0 ? '<- kontrol et' : 'temiz');
  } catch {}

  const bizEmbedTotal = await p.businessEmbedding.count().catch(()=>0);
  sep();
  line('BusinessEmbedding', fmt(bizEmbedTotal), `/ ${fmt(totalB)} isletme (${pct(bizEmbedTotal, totalB)})`);

  // 5. VERITABANI BOYUTU
  hdr('💾', 'VERITABANI BOYUTU');
  console.log('');

  const dbSizes = await p.$queryRawUnsafe(`SELECT relname as t, pg_size_pretty(pg_total_relation_size(relid)) as total, pg_size_pretty(pg_relation_size(relid)) as data, pg_size_pretty(pg_indexes_size(relid)) as idx FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 10`);
  const dbTotal = await p.$queryRawUnsafe(`SELECT pg_size_pretty(pg_database_size(current_database())) as size`);

  console.log(`  ${'Tablo'.padEnd(26)} ${'Toplam'.padStart(10)} ${'Veri'.padStart(10)} ${'Index'.padStart(10)}`);
  sep();
  for (const r of dbSizes)
    console.log(`  ${(r.t||'').padEnd(26)} ${String(r.total).padStart(10)} ${String(r.data).padStart(10)} ${String(r.idx).padStart(10)}`);
  sep();
  console.log(`  ${'TOPLAM'.padEnd(26)} ${String(dbTotal[0].size).padStart(10)}`);

  const elapsed = ((Date.now()-t0)/1000).toFixed(1);
  console.log(`\n\u2554` + '\u2550'.repeat(67) + `\u2557`);
  console.log(`\u2551  Rapor suresi: ${(elapsed+' sn').padEnd(55)}\u2551`);
  console.log(`\u2551  ${new Date().toLocaleString('tr-TR').padEnd(67)}\u2551`);
  console.log(`\u255a` + '\u2550'.repeat(67) + `\u255d\n`);
}

main().catch(e => { console.error('HATA:', e.message); }).finally(() => p.$disconnect());
