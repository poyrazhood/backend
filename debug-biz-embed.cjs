const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // failed olan ilk 3 işletmeyi bul ve embed metnini üret
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
    LIMIT 3
  `);

  for (const biz of businesses) {
    const reviews = await prisma.externalReview.findMany({
      where: { businessId: biz.id, content: { not: null } },
      select: { id: true, content: true, publishedAt: true, ownerReply: true },
      take: 5,
    });

    const attr = typeof biz.attributes === 'string' ? JSON.parse(biz.attributes) : biz.attributes ?? {};
    const text = [
      biz.name,
      biz.category_name,
      biz.city,
      biz.district,
      reviews.map(r => r.content?.slice(0, 200)).join(' / ')
    ].filter(Boolean).join(' | ');

    console.log(`\n--- ${biz.name} ---`);
    console.log(`Yorum sayısı: ${reviews.length}`);
    console.log(`Metin uzunluğu: ${text.length}`);

    // Ollama test
    const res = await fetch('http://localhost:11434/api/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'mxbai-embed-large', input: [text] }),
    });
    console.log(`Ollama: HTTP ${res.status}`);
    if (!res.ok) {
      const err = await res.text();
      console.log(`Hata: ${err}`);
    }
  }
}

main().finally(() => prisma.$disconnect());
