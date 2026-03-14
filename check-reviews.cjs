const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

p.externalReview.findMany({
  orderBy: { scrapedAt: 'desc' },
  take: 10,
  select: {
    authorName: true,
    authorLevel: true,
    authorReviewCount: true,
    rating: true,
    content: true,
    publishedAt: true,
    source: true,
  }
}).then(reviews => {
  console.log(`\nToplam: ${reviews.length} yorum\n`);
  reviews.forEach((r, i) => {
    console.log(`--- ${i + 1}. Yorum ---`);
    console.log(`Yazar     : ${r.authorName}`);
    console.log(`Seviye    : ${r.authorLevel || '-'}`);
    console.log(`Yorum sayısı: ${r.authorReviewCount || '-'}`);
    console.log(`Rating    : ⭐${r.rating}`);
    console.log(`Tarih     : ${r.publishedAt || '-'}`);
    console.log(`İçerik    : ${r.content}`);
    console.log('');
  });
}).finally(() => p.$disconnect());
