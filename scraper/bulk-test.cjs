/**
 * bulk-test.cjs — 10 işletmeyi sırayla test eder, sonuçları özetler
 * Kullanım: node scraper/bulk-test.cjs
 */
'use strict';

const { chromium }     = require('playwright');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// playwright-review-scraperv2.cjs'deki scrapeBusiness fonksiyonunu inline kullanmak yerine
// direkt o dosyayı require edemeyiz (main() çalışır), bu yüzden
// sadece ID listesi çıkarıp tek tek test komutunu simüle ederiz.

async function main() {
  // Farklı şehirlerden, farklı kategorilerden 10 işletme al
  const businesses = await prisma.business.findMany({
    where: { isActive: true, isDeleted: false },
    select: { id: true, name: true, city: true, district: true },
    take: 10,
    skip: Math.floor(Math.random() * 1000), // rastgele başlangıç
    orderBy: { createdAt: 'desc' },
  });

  console.log(`\n📋 Test edilecek ${businesses.length} işletme:\n`);
  businesses.forEach((b, i) =>
    console.log(`  ${i + 1}. [${b.id}] ${b.name} — ${b.city}`)
  );

  console.log('\n─────────────────────────────────────────────────');
  console.log('Test başlatmak için aşağıdaki komutları çalıştır:');
  console.log('─────────────────────────────────────────────────\n');

  businesses.forEach(b =>
    console.log(`node scraper/playwright-review-scraperv2.cjs test --id ${b.id}`)
  );

  await prisma.$disconnect();
}

main().catch(console.error);
