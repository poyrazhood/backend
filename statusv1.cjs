'use strict';
const { PrismaClient } = require('@prisma/client');
const Database = require('better-sqlite3');
const path = require('path');
const p = new PrismaClient();

const pct = (n, t) => t > 0 ? `${((n / t) * 100).toFixed(1)}%` : '0%';
const fmt = n => Number(n).toLocaleString('tr-TR');
const pb  = (done, total, w = 36) => {
  const r = total > 0 ? Math.min(done / total, 1) : 0;
  const f = Math.round(r * w);
  return `[${'█'.repeat(f)}${'░'.repeat(w - f)}] ${(r * 100).toFixed(1)}%`;
};
const line = (label, value, extra = '') => {
  const l = (label + ' ').padEnd(28, '.');
  const v = String(value).padStart(12);
  console.log(`  ${l} ${v}${extra ? '  ' + extra : ''}`);
};
const sep  = () => console.log('  ' + '─'.repeat(64));
const hdr  = (icon, title) => console.log(`\n  ${icon}  ${title}\n  ${'─'.repeat(64)}`);

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

  console.log('\n╔' + '═'.repeat(67) + '╗');
  console.log('║            TECRUBELERIM — DURUM RAPORU                           ║');
  console.log(`║            ${new Date().toLocaleString('tr-TR').padEnd(57)}║`);
  console.log('╚' + '═'.repeat(67) + '╝');

  // ── 1. SCRAPER ──────────────────────────────────────────────────────
  hdr('🔄', 'SCRAPER');

  const detailQ = getQueue(path.join(__dirname, 'memory/detail-queue.db'), 'jobs');
  const reviewQ = getQueue(path.join(__dirname, 'memory/review-queue.db'), 'jobs');

  for (const [lbl, q] of [['Detail Scraper', detailQ], ['Review Scraper', reviewQ]]) {
    if (!q) { console.log(`  ${lbl}: queue bulunamadı`); continue; }
    const total   = q.pending + q.done + q.failed + q.running;
    const hizSaat = q.recentDone;
    const kalanDk = hizSaat > 0 ? Math.round(q.pending / (hizSaat / 60)) : null;
    console.log(`\n  ${lbl}:`);
    console.log(`  ${pb(q.done, total)}`);
    line('  Tamamlanan', `${fmt(q.done)} / ${fmt(total)}`, `(${pct(q.done, total)})`);
    line('  Bekleyen',   fmt(q.pending));
    if (q.failed > 0) line('  Hatalı', fmt(q.failed), '<- kontrol et');
    line('  Hız (son 1sa)', fmt(hizSaat) + ' iş/saat');
    if (kalanDk !== null) {
      const bitis = new Date(Date.now() + kalanDk * 60000);
      line('  Tahmini bitiş', `~${(kalanDk / 60).toFixed(1)} saat`, bitis.toLocaleString('tr-TR'));
    }
  }

  // ── 2. İŞLETME ──────────────────────────────────────────────────────
  hdr('🏢', 'İŞLETMELER');

  const [totalB, withDetail, withPhone, withHours, withRating, reviewDist] = await Promise.all([
    p.business.count({ where: { isActive: true, isDeleted: false } }),
    p.$queryRawUnsafe(`
      SELECT COUNT(*) as c FROM "Business"
      WHERE "isActive"=true AND "isDeleted"=false
      AND ("phoneNumber" IS NOT NULL OR "website" IS NOT NULL
           OR attributes->>'coverPhoto' IS NOT NULL)
    `).then(r => Number(r[0].c)),
    p.business.count({ where: { phoneNumber: { not: null }, isActive: true, isDeleted: false } }),
    p.openingHours.groupBy({ by: ['businessId'] }).then(r => r.length),
    p.business.count({ where: { averageRating: { gt: 0 }, isActive: true, isDeleted: false } }),
    p.$queryRawUnsafe(`
      SELECT
        COUNT(*) FILTER (WHERE "totalReviews" = 0)           as sifir,
        COUNT(*) FILTER (WHERE "totalReviews" BETWEEN 1 AND 4)   as az,
        COUNT(*) FILTER (WHERE "totalReviews" BETWEEN 5 AND 24)  as orta,
        COUNT(*) FILTER (WHERE "totalReviews" BETWEEN 25 AND 99) as iyi,
        COUNT(*) FILTER (WHERE "totalReviews" >= 100)            as cok
      FROM "Business" WHERE "isActive"=true AND "isDeleted"=false
    `).then(r => { const o = r[0]; return { sifir: Number(o.sifir), az: Number(o.az), orta: Number(o.orta), iyi: Number(o.iyi), cok: Number(o.cok) } }),
  ]);

  console.log('');
  line('Toplam işletme',   fmt(totalB));
  line('Detayı çekilmiş', fmt(withDetail),  `(${pct(withDetail, totalB)})`);
  line('Telefonu olan',   fmt(withPhone),   `(${pct(withPhone, totalB)})`);
  line('Saati olan',      fmt(withHours),   `(${pct(withHours, totalB)})`);
  line("Rating'i olan",   fmt(withRating),  `(${pct(withRating, totalB)})`);

  console.log('\n  Yorum dağılımı:');
  console.log(`    0 yorum     : ${fmt(reviewDist.sifir).padStart(8)}  (${pct(reviewDist.sifir, totalB)})`);
  console.log(`    1–4 yorum   : ${fmt(reviewDist.az).padStart(8)}  (${pct(reviewDist.az, totalB)})`);
  console.log(`    5–24 yorum  : ${fmt(reviewDist.orta).padStart(8)}  (${pct(reviewDist.orta, totalB)})`);
  console.log(`    25–99 yorum : ${fmt(reviewDist.iyi).padStart(8)}  (${pct(reviewDist.iyi, totalB)})`);
  console.log(`    100+ yorum  : ${fmt(reviewDist.cok).padStart(8)}  (${pct(reviewDist.cok, totalB)})`);

  // ── 3. YORUMLAR ──────────────────────────────────────────────────────
  hdr('💬', 'YORUMLAR');

  const [totalRev, withContent, withReply, bizWithReview] = await Promise.all([
    p.externalReview.count(),
    p.externalReview.count({ where: { content: { not: null } } }),
    p.externalReview.count({ where: { ownerReply: { not: null } } }),
    p.$queryRawUnsafe(`SELECT COUNT(DISTINCT "businessId") as c FROM "ExternalReview"`).then(r => Number(r[0].c)),
  ]);

  console.log('');
  line('Toplam yorum',        fmt(totalRev));
  line('Metin içeren',        fmt(withContent),   `(${pct(withContent, totalRev)})`);
  line('İşletme yanıtlı',    fmt(withReply),     `(${pct(withReply, totalRev)})`);
  line('Yorumu olan işletme', fmt(bizWithReview), `/ ${fmt(totalB)} işletme`);

  // ── 4. EMBEDDING ──────────────────────────────────────────────────────
  hdr('🧠', 'EMBEDDING');

  const [revEmbedTotal, revEmbedable, bizEmbedTotal, revEmbedLastHour] = await Promise.all([
    p.reviewEmbedding.count(),
    p.externalReview.count({ where: { content: { not: null } } }),
    p.businessEmbedding.count().catch(() => 0),
    p.$queryRawUnsafe(`SELECT COUNT(*) as c FROM "ReviewEmbedding" WHERE "createdAt" > NOW() - INTERVAL '1 hour'`).then(r => Number(r[0]?.c || 0)).catch(() => 0),
  ]);

  console.log('\n  Review Embedding:');
  console.log(`  ${pb(revEmbedTotal, revEmbedable)}`);
  line('  Embed edilen', `${fmt(revEmbedTotal)} / ${fmt(revEmbedable)}`, `(${pct(revEmbedTotal, revEmbedable)})`);
  line('  Hız (son 1sa)', fmt(revEmbedLastHour) + ' embed/saat');

  console.log('\n  Business Embedding:');
  console.log(`  ${pb(bizEmbedTotal, totalB)}`);
  line('  Embed edilen', `${fmt(bizEmbedTotal)} / ${fmt(totalB)}`, `(${pct(bizEmbedTotal, totalB)})`);

  // ── 5. AI ENRİCH ──────────────────────────────────────────────────────
  hdr('✨', 'AI ENRİCHMENT (25+ yorum)');

  const [enrichTotal, enrichTarget, qaTotal] = await Promise.all([
    p.$queryRawUnsafe(`SELECT COUNT(*) as c FROM "Business" WHERE attributes->'ai' IS NOT NULL AND "isActive"=true AND "isDeleted"=false`).then(r => Number(r[0].c)),
    p.business.count({ where: { isActive: true, isDeleted: false, totalReviews: { gte: 25 } } }),
    p.businessQA.count().catch(() => 0),
  ]);

  console.log('');
  console.log(`  ${pb(enrichTotal, enrichTarget)}`);
  line('  İşlenen',   `${fmt(enrichTotal)} / ${fmt(enrichTarget)}`, `(${pct(enrichTotal, enrichTarget)})`);
  line('  Kalan',     fmt(enrichTarget - enrichTotal));
  line('  Q&A kayıt', fmt(qaTotal));

  // ── 6. VERİTABANI ──────────────────────────────────────────────────────
  hdr('💾', 'VERİTABANI BOYUTU');

  const [dbSizes, dbTotal] = await Promise.all([
    p.$queryRawUnsafe(`
      SELECT relname as t,
        pg_size_pretty(pg_total_relation_size(relid)) as total
      FROM pg_catalog.pg_statio_user_tables
      ORDER BY pg_total_relation_size(relid) DESC LIMIT 8
    `),
    p.$queryRawUnsafe(`SELECT pg_size_pretty(pg_database_size(current_database())) as size`),
  ]);

  console.log('');
  console.log(`  ${'Tablo'.padEnd(28)} ${'Boyut'.padStart(10)}`);
  sep();
  for (const r of dbSizes)
    console.log(`  ${(r.t || '').padEnd(28)} ${String(r.total).padStart(10)}`);
  sep();
  console.log(`  ${'TOPLAM'.padEnd(28)} ${String(dbTotal[0].size).padStart(10)}`);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n  Süre: ${elapsed} sn\n`);
}

main().catch(e => console.error('HATA:', e.message)).finally(() => p.$disconnect());
