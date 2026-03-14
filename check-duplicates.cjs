'use strict';
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const [r] = await p.$queryRawUnsafe(`
    SELECT 
      COUNT(*) as total,
      COUNT(DISTINCT "sourceId") as unique_source_id,
      COUNT(DISTINCT "businessId") as biz_with_reviews,
      SUM(CASE WHEN "sourceId" IS NULL THEN 1 ELSE 0 END) as null_source_id,
      SUM(CASE WHEN "sourceId" IS NOT NULL THEN 1 ELSE 0 END) as has_source_id
    FROM "ExternalReview"
  `);

  console.log('\n=== YORUM DUPLICATE ANALİZİ ===');
  console.log('Toplam yorum        :', Number(r.total).toLocaleString('tr-TR'));
  console.log('Unique sourceId     :', Number(r.unique_source_id).toLocaleString('tr-TR'));
  console.log('sourceId DOLU       :', Number(r.has_source_id).toLocaleString('tr-TR'));
  console.log('sourceId NULL       :', Number(r.null_source_id).toLocaleString('tr-TR'));
  console.log('Yorum olan işletme  :', Number(r.biz_with_reviews).toLocaleString('tr-TR'));

  const nullPct = (Number(r.null_source_id) / Number(r.total) * 100).toFixed(1);
  console.log('\nnull oranı: %' + nullPct);

  if (Number(r.null_source_id) > 0) {
    console.log('⚠️  sourceId NULL yorumlar var — duplicate koruması çalışmıyor!');
  } else {
    console.log('✅ Tüm yorumların sourceId si dolu — duplicate koruması aktif.');
  }
}

main().catch(e => console.error('HATA:', e.message)).finally(() => p.$disconnect());
