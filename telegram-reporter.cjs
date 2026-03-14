'use strict';
const { PrismaClient } = require('@prisma/client');
const Database = require('better-sqlite3');
const path = require('path');
const https = require('https');

const BOT_TOKEN = '8120711934:AAEMVipEcKn4zx36zkZnNb1X2OOiYVcJMhQ';
const CHAT_ID   = '5942335763';
const p = new PrismaClient();

const fmt  = n => Number(n).toLocaleString('tr-TR');
const pct  = (n, t) => t > 0 ? `${((n/t)*100).toFixed(1)}%` : '0%';
const dur  = (ms) => { const h = Math.floor(ms/3600000); const m = Math.floor((ms%3600000)/60000); return h > 0 ? `${h}s ${m}dk` : `${m}dk`; };

function getQueueStats(dbPath) {
  try {
    const db = new Database(dbPath, { readonly: true });
    const rows   = db.prepare("SELECT status, COUNT(*) as c FROM jobs GROUP BY status").all();
    const recent = db.prepare("SELECT COUNT(*) as c FROM jobs WHERE status='done' AND done_at > datetime('now','-1 hour')").get();
    db.close();
    const stats = { pending:0, done:0, failed:0, running:0, recentHour: recent?.c || 0 };
    for (const r of rows) stats[r.status] = r.c;
    return stats;
  } catch { return null; }
}

function progressBar(done, total, width=20) {
  const ratio  = total > 0 ? done/total : 0;
  const filled = Math.round(ratio * width);
  return `${'█'.repeat(filled)}${'░'.repeat(width-filled)} ${(ratio*100).toFixed(1)}%`;
}

function sendTelegram(text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        const json = JSON.parse(data);
        if (json.ok) resolve(json);
        else reject(new Error(json.description));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function buildReport() {
  const now = new Date().toLocaleString('tr-TR');

  // Queue
  const dQ = getQueueStats(path.join(__dirname, 'memory/detail-queue.db'));
  const rQ = getQueueStats(path.join(__dirname, 'memory/review-queue.db'));

  // DB verileri
  const [
    totalBusiness, withPhone, withRating, withCoverPhoto,
    totalRev, withContent, withPhotosRev,
    ratingDist,
  ] = await Promise.all([
    p.business.count(),
    p.business.count({ where: { phoneNumber: { not:null } } }),
    p.business.count({ where: { averageRating: { gt:0 } } }),
    p.$queryRawUnsafe(`SELECT COUNT(*) as c FROM "Business" WHERE attributes->>'coverPhoto' IS NOT NULL`).then(r=>Number(r[0].c)).catch(()=>0),
    p.externalReview.count(),
    p.externalReview.count({ where: { content: { not:null } } }),
    p.externalReview.count({ where: { NOT: { photos: { equals:[] } } } }),
    p.$queryRawUnsafe(`SELECT FLOOR(rating) as stars, COUNT(*) as cnt FROM "ExternalReview" WHERE rating IS NOT NULL GROUP BY stars ORDER BY stars DESC`),
  ]);

  // ── ÖZET MESAJ ─────────────────────────────────────────────────
  const dTotal = dQ ? dQ.pending + dQ.done + dQ.failed + dQ.running : 0;
  const rTotal = rQ ? rQ.pending + rQ.done + rQ.failed + rQ.running : 0;

  let ozet = `🏢 <b>TECRÜBELERIM — 2 SAATLİK RAPOR</b>\n`;
  ozet += `🕐 ${now}\n`;
  ozet += `${'─'.repeat(32)}\n\n`;

  // Scraper durumu
  ozet += `⚙️ <b>SCRAPER DURUMU</b>\n`;
  if (dQ) {
    const dHz = dQ.recentHour;
    const dBitis = dQ.pending > 0 && dHz > 0 ? dur(Math.ceil(dQ.pending/dHz)*3600000) : '?';
    ozet += `📋 Detail: ${progressBar(dQ.done, dTotal)}\n`;
    ozet += `   ✅ ${fmt(dQ.done)} tamamlandı / ⏳ ${fmt(dQ.pending)} bekliyor\n`;
    ozet += `   🚀 Hız: ${fmt(dHz)}/saat | Bitiş: ~${dBitis}\n`;
    if (dQ.failed > 500) ozet += `   ⚠️ ${fmt(dQ.failed)} hatalı kayıt!\n`;
  }
  ozet += '\n';
  if (rQ) {
    const rHz = rQ.recentHour;
    const rBitis1 = rQ.pending > 0 && rHz > 0 ? dur(Math.ceil(rQ.pending/rHz)*3600000) : '?';
    const rBitis2 = rQ.pending > 0 && rHz > 0 ? dur(Math.ceil(rQ.pending/(rHz*2))*3600000) : '?';
    ozet += `💬 Review: ${progressBar(rQ.done, rTotal)}\n`;
    ozet += `   ✅ ${fmt(rQ.done)} tamamlandı / ⏳ ${fmt(rQ.pending)} bekliyor\n`;
    ozet += `   🚀 Hız: ${fmt(rHz)}/saat\n`;
    ozet += `   ⏱️ 1 PC: ~${rBitis1} | 2 PC: ~${rBitis2}\n`;
    if (rQ.failed > 100) ozet += `   ⚠️ ${fmt(rQ.failed)} hatalı kayıt!\n`;
  }

  ozet += `\n${'─'.repeat(32)}\n`;

  // İşletme verileri
  ozet += `\n🏪 <b>İŞLETME VERİLERİ</b>\n`;
  ozet += `📊 Toplam: ${fmt(totalBusiness)}\n`;
  ozet += `📞 Telefon: ${fmt(withPhone)} (${pct(withPhone, totalBusiness)})\n`;
  ozet += `⭐ Rating: ${fmt(withRating)} (${pct(withRating, totalBusiness)})\n`;
  ozet += `📸 Kapak foto: ${fmt(withCoverPhoto)} (${pct(withCoverPhoto, totalBusiness)})\n`;

  ozet += `\n${'─'.repeat(32)}\n`;

  // Yorum verileri
  ozet += `\n💬 <b>GOOGLE YORUMLARI</b>\n`;
  ozet += `📝 Toplam: ${fmt(totalRev)}\n`;
  ozet += `✍️ Metin içeren: ${fmt(withContent)} (${pct(withContent, totalRev)})\n`;
  ozet += `📷 Fotoğraflı: ${fmt(withPhotosRev)} (${pct(withPhotosRev, totalRev)})\n\n`;
  ozet += `Puan dağılımı:\n`;
  for (const r of ratingDist) {
    ozet += `  ${'⭐'.repeat(Number(r.stars))} ${fmt(r.cnt)}\n`;
  }

  return ozet;
}

async function buildDetayliRapor() {
  // Kategori analizi
  const catStats = await p.$queryRawUnsafe(`
    SELECT c.name as cat, COUNT(b.id) as total,
      SUM(CASE WHEN b."phoneNumber" IS NOT NULL THEN 1 ELSE 0 END) as with_phone,
      ROUND(AVG(b."averageRating")::numeric,2) as avg_rating,
      SUM(b."totalReviews") as total_reviews
    FROM "Business" b JOIN "Category" c ON b."categoryId"=c.id
    GROUP BY c.name ORDER BY total DESC LIMIT 8
  `).catch(()=>[]);

  // İl analizi
  const ilStats = await p.$queryRawUnsafe(`
    SELECT city, COUNT(*) as total,
      SUM(CASE WHEN "phoneNumber" IS NOT NULL THEN 1 ELSE 0 END) as with_phone,
      ROUND(AVG("averageRating")::numeric,2) as avg_rating
    FROM "Business" WHERE "isActive"=true
    GROUP BY city ORDER BY total DESC LIMIT 8
  `).catch(()=>[]);

  // Veri kalitesi uyarıları
  const [dupPhone, suspRating] = await Promise.all([
    p.$queryRawUnsafe(`SELECT COUNT(*) as c FROM (SELECT "phoneNumber" FROM "Business" WHERE "phoneNumber" IS NOT NULL GROUP BY "phoneNumber" HAVING COUNT(*)>1) t`).then(r=>Number(r[0].c)).catch(()=>0),
    p.business.count({ where:{averageRating:{gte:4.9},totalReviews:{lte:2,gt:0}} }).catch(()=>0),
  ]);

  // DB boyutu
  const dbSize = await p.$queryRawUnsafe(`SELECT pg_size_pretty(pg_database_size(current_database())) as size`).then(r=>r[0].size).catch(()=>'?');

  let detay = `📂 <b>KATEGORİ ANALİZİ</b>\n`;
  for (const r of catStats) {
    const telPct = ((Number(r.with_phone)/Number(r.total))*100).toFixed(0);
    detay += `• ${r.cat}: ${fmt(r.total)} işletme | Tel: %${telPct} | Puan: ${r.avg_rating||'-'}\n`;
  }

  detay += `\n🗺️ <b>İL BAZINDA DURUM</b>\n`;
  for (const r of ilStats) {
    const telPct = ((Number(r.with_phone)/Number(r.total))*100).toFixed(0);
    detay += `• ${r.city}: ${fmt(r.total)} | Tel: %${telPct} | Puan: ${r.avg_rating||'-'}\n`;
  }

  detay += `\n🚨 <b>VERİ KALİTESİ</b>\n`;
  if (dupPhone > 0) detay += `⚠️ ${fmt(dupPhone)} duplike telefon\n`;
  if (suspRating > 0) detay += `⚠️ ${fmt(suspRating)} şüpheli rating (4.9+ ≤2 yorum)\n`;
  if (dupPhone === 0 && suspRating === 0) detay += `✅ Kritik sorun yok\n`;

  detay += `\n💾 <b>DB BOYUTU:</b> ${dbSize}\n`;

  return detay;
}

async function main() {
  try {
    console.log('📤 Telegram raporu hazırlanıyor...');

    const [ozet, detay] = await Promise.all([buildReport(), buildDetayliRapor()]);

    // Özet mesajı gönder
    await sendTelegram(ozet);
    console.log('✅ Özet gönderildi');

    // Kısa bekle
    await new Promise(r => setTimeout(r, 1000));

    // Detaylı rapor gönder
    await sendTelegram(detay);
    console.log('✅ Detaylı rapor gönderildi');

  } catch (err) {
    console.error('❌ Hata:', err.message);
    // Hata olursa da Telegram'a bildir
    try {
      await sendTelegram(`❌ <b>Rapor hatası!</b>\n${err.message}`);
    } catch {}
  } finally {
    await p.$disconnect();
  }
}

main();
