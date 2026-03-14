import { PrismaClient } from '@prisma/client';
import { generateSlug, generateUniqueSlug } from '../src/utils/slugify.js';

const prisma = new PrismaClient();

/**
 * Boş veya null slug'a sahip işletmeleri günceller
 * Türkçe karakterleri dönüştürerek SEO-friendly slug oluşturur
 */
async function updateEmptySlugs() {
  console.log('🔄 Boş slug\'ları güncelleniyor...');

  try {
    // Boş veya null slug'a sahip işletmeleri bul
    const businessesWithEmptySlugs = await prisma.business.findMany({
      where: {
        OR: [
          { slug: '' },
          { slug: null },
        ],
      },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });

    if (businessesWithEmptySlugs.length === 0) {
      console.log('✅ Güncellenecek işletme bulunamadı. Tüm slug\'lar dolu.');
      return;
    }

    console.log(`📊 ${businessesWithEmptySlugs.length} işletme bulundu.`);

    // Her işletme için slug oluştur ve güncelle
    for (const business of businessesWithEmptySlugs) {
      const baseSlug = generateSlug(business.name);

      // Slug collision kontrolü
      const checkSlugExists = async (slug) => {
        const existing = await prisma.business.findFirst({
          where: {
            slug,
            id: { not: business.id }, // Kendi ID'sini hariç tut
          },
        });
        return !!existing;
      };

      const uniqueSlug = await generateUniqueSlug(baseSlug, checkSlugExists);

      // Slug'ı güncelle
      await prisma.business.update({
        where: { id: business.id },
        data: { slug: uniqueSlug },
      });

      console.log(`✓ "${business.name}" -> "${uniqueSlug}"`);
    }

    console.log(`\n✅ ${businessesWithEmptySlugs.length} işletme başarıyla güncellendi!`);
  } catch (error) {
    console.error('❌ Hata:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Script'i çalıştır
updateEmptySlugs();
