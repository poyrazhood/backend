const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

p.$queryRawUnsafe(`
  SELECT COUNT(*) as c FROM "Business" b
  WHERE (
    b.attributes->>'coverPhoto' IS NOT NULL
    OR b.attributes->'about' IS NOT NULL
  )
  AND b."totalReviews" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "BusinessEmbedding" be WHERE be."businessId" = b.id
  )
`).then(r => {
  console.log('Embed edilmeye hazir isletme:', Number(r[0].c).toLocaleString('tr-TR'));
}).finally(() => p.$disconnect());
