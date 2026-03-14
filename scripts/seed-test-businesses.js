const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const slugify = require('slugify');

async function main() {
  console.log('🚀 Test verileri oluşturuluyor...');

  // 1. Örnek bir kategori oluştur (Eğer yoksa)
  const category = await prisma.category.upsert({
    where: { name: 'Restoran' },
    update: {},
    create: {
      name: 'Restoran',
      slug: 'restoran',
      icon: 'Utensils'
    },
  });

  // 2. Test İşletmeleri Verisi
  const businesses = [
    {
      name: 'Çiçek Kebap & Salonu',
      address: 'Atatürk Caddesi No:42',
      city: 'İstanbul',
      website: 'https://cicekkebap.com',
    },
    {
      name: 'Güzel Kahve Dünyası',
      address: 'Bağdat Caddesi No:101',
      city: 'İstanbul',
      website: 'https://guzelkahve.com',
    },
    {
      name: 'Şık Restaurant & Bar',
      address: 'Kordon Boyu No:5',
      city: 'İzmir',
      website: 'https://sikrest.com',
    }
  ];

  for (const b of businesses) {
    const baseSlug = slugify(b.name, { lower: true, strict: true, locale: 'tr' });
    
    await prisma.business.upsert({
      where: { slug: baseSlug },
      update: {},
      create: {
        ...b,
        slug: baseSlug,
        categoryId: category.id,
        averageRating: 4.9, // Statik test puanı
        totalReviews: 124,
      },
    });
    console.log(`✅ İşletme eklendi: ${b.name} -> /business/${baseSlug}`);
  }

  console.log('✨ İşlem başarıyla tamamlandı. Artık ana sayfayı yenileyebilirsin!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
