require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  // Kaç işletme işlenmiş?
  const cnt = await p.$queryRawUnsafe(
    `SELECT COUNT(*) as sayi FROM "Business" WHERE attributes->'ai'->>'processedAt' IS NOT NULL`
  );
  console.log('processedAt IS NOT NULL olan:', cnt[0].sayi);

  // Örnek bir işlenmiş kaydın attributes yapısına bak
  const sample = await p.$queryRawUnsafe(
    `SELECT id, attributes->'ai' as ai_field FROM "Business" 
     WHERE attributes->'ai'->>'processedAt' IS NOT NULL LIMIT 2`
  );
  console.log('Ornek ai field:', JSON.stringify(sample, null, 2));

  // Farklı path denemeleri
  const alt1 = await p.$queryRawUnsafe(
    `SELECT COUNT(*) as sayi FROM "Business" WHERE attributes->>'processedAt' IS NOT NULL`
  );
  console.log('attributes->>processedAt (ust seviye):', alt1[0].sayi);

  await p.$disconnect();
})().catch(e => { console.error('HATA:', e.message); p.$disconnect(); });
