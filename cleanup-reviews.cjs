/**
 * Aynı businessId + authorName + rating kombinasyonundan fazlasını siler.
 * En güncel olanı (scrapedAt en yüksek) bırakır.
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // Tüm Google yorumlarını çek
  const all = await p.externalReview.findMany({
    where: { source: 'GOOGLE' },
    orderBy: { scrapedAt: 'desc' },
  });

  console.log(`Toplam kayıt: ${all.length}`);

  // businessId + authorName + content'e göre grupla
  const seen = new Map();
  const toDelete = [];

  for (const r of all) {
    const key = `${r.businessId}__${r.authorName}__${r.rating}__${(r.content || '').substring(0, 50)}`;
    if (seen.has(key)) {
      toDelete.push(r.id);
    } else {
      seen.set(key, r.id);
    }
  }

  if (toDelete.length === 0) {
    console.log('Duplicate yok, temiz.');
    return;
  }

  console.log(`${toDelete.length} duplicate siliniyor...`);
  await p.externalReview.deleteMany({ where: { id: { in: toDelete } } });
  console.log('✅ Temizlendi.');

  const remaining = await p.externalReview.count();
  console.log(`Kalan kayıt: ${remaining}`);
}

main()
  .catch(console.error)
  .finally(() => p.$disconnect());
