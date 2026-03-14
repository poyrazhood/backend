import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create categories
  const categories = [
    {
      name: 'Restoran',
      slug: 'restoran',
      description: 'Yemek ve içecek hizmeti veren işletmeler',
      icon: '🍽️',
      attributeSchema: [
        { name: 'cuisine_type', type: 'string', label: 'Mutfak Türü' },
        { name: 'price_range', type: 'string', label: 'Fiyat Aralığı' },
        { name: 'opening_hours', type: 'object', label: 'Açılış Saatleri' },
        { name: 'delivery_available', type: 'boolean', label: 'Paket Servis' },
      ],
    },
    {
      name: 'Kafe',
      slug: 'kafe',
      description: 'Kahve ve hafif yiyecek servisi yapan mekanlar',
      icon: '☕',
      attributeSchema: [
        { name: 'wifi_available', type: 'boolean', label: 'Wi-Fi' },
        { name: 'outdoor_seating', type: 'boolean', label: 'Açık Hava Oturma' },
        { name: 'opening_hours', type: 'object', label: 'Açılış Saatleri' },
      ],
    },
    {
      name: 'Otel',
      slug: 'otel',
      description: 'Konaklama hizmeti veren işletmeler',
      icon: '🏨',
      attributeSchema: [
        { name: 'star_rating', type: 'number', label: 'Yıldız Sayısı' },
        { name: 'room_count', type: 'number', label: 'Oda Sayısı' },
        { name: 'amenities', type: 'array', label: 'Olanaklar' },
        { name: 'check_in_time', type: 'string', label: 'Giriş Saati' },
      ],
    },
    {
      name: 'Market',
      slug: 'market',
      description: 'Gıda ve temel ihtiyaç ürünleri satan işletmeler',
      icon: '🛒',
      attributeSchema: [
        { name: 'opening_hours', type: 'object', label: 'Açılış Saatleri' },
        { name: 'parking_available', type: 'boolean', label: 'Otopark' },
        { name: 'home_delivery', type: 'boolean', label: 'Eve Teslimat' },
      ],
    },
    {
      name: 'Kuaför & Berber',
      slug: 'kuafor-berber',
      description: 'Saç bakımı ve güzellik hizmetleri',
      icon: '💇',
      attributeSchema: [
        { name: 'services', type: 'array', label: 'Hizmetler' },
        { name: 'appointment_required', type: 'boolean', label: 'Randevu Gerekli' },
        { name: 'opening_hours', type: 'object', label: 'Açılış Saatleri' },
      ],
    },
    {
      name: 'Eczane',
      slug: 'eczane',
      description: 'İlaç ve sağlık ürünleri satan işletmeler',
      icon: '💊',
      attributeSchema: [
        { name: 'opening_hours', type: 'object', label: 'Açılış Saatleri' },
        { name: 'night_service', type: 'boolean', label: 'Nöbetçi Eczane' },
        { name: 'home_delivery', type: 'boolean', label: 'Eve Teslimat' },
      ],
    },
    {
      name: 'Spor Salonu',
      slug: 'spor-salonu',
      description: 'Fitness ve spor aktiviteleri',
      icon: '🏋️',
      attributeSchema: [
        { name: 'facilities', type: 'array', label: 'Olanaklar' },
        { name: 'membership_types', type: 'array', label: 'Üyelik Tipleri' },
        { name: 'opening_hours', type: 'object', label: 'Açılış Saatleri' },
        { name: 'personal_trainer', type: 'boolean', label: 'Kişisel Antrenör' },
      ],
    },
    {
      name: 'Veteriner',
      slug: 'veteriner',
      description: 'Hayvan sağlığı hizmetleri',
      icon: '🐾',
      attributeSchema: [
        { name: 'services', type: 'array', label: 'Hizmetler' },
        { name: 'emergency_service', type: 'boolean', label: 'Acil Servis' },
        { name: 'opening_hours', type: 'object', label: 'Açılış Saatleri' },
      ],
    },
  ];

  for (const category of categories) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: {},
      create: category,
    });
    console.log(`✓ Created category: ${category.name}`);
  }

  console.log('✅ Database seed completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
