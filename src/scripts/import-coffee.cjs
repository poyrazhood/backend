const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function importCoffeeData() {
  const category = await prisma.category.upsert({
    where: { slug: 'coffee' },
    create: { name: 'Coffee', slug: 'coffee' },
    update: {}
  });

  const coffeeShops = [
    {
      name: "Walter's Coffee Roastery",
      rating: 4.3,
      reviewCount: 2696,
      address: "Bademaltı Sk. No:21",
      phoneNumber: null
    },
    {
      name: "Good Coffee Roasting Co.",
      rating: 4.8,
      reviewCount: 514,
      address: "Okur Sk. No: 16A",
      phoneNumber: null
    },
    {
      name: "Coffee Manifesto",
      rating: 4.5,
      reviewCount: 600,
      address: "Güneşlibahçe Sok. No:40A",
      phoneNumber: null
    },
    {
      name: "Urban Roastery",
      rating: 4.6,
      reviewCount: 274,
      address: "Şevki Bey Sk. No:2/A",
      phoneNumber: null
    },
    {
      name: "Story Coffee & Roastery",
      rating: 4.5,
      reviewCount: 415,
      address: "Halitağa Cd. no 61",
      phoneNumber: null
    },
    {
      name: "Meet Lab Coffee",
      rating: 4.6,
      reviewCount: 225,
      address: "Ruşen Ağa Sk. No:11 / A",
      phoneNumber: null
    },
    {
      name: "Meet Lab Coffee",
      rating: 4.3,
      reviewCount: 320,
      address: "Plaj Yolu Sk. No:18, 34740",
      phoneNumber: null
    }
  ];

  for (const shop of coffeeShops) {
    const slug = shop.name.toLowerCase().replace(/\s+/g, '-');
    await prisma.business.upsert({
      where: { slug },
      update: {  
        averageRating: shop.rating,
        totalReviews: shop.reviewCount,
        address: shop.address,
        city: 'İstanbul',
        district: 'Kadıköy',
        phoneNumber: shop.phoneNumber,
      },
      create: {
        name: shop.name,
        slug,
        averageRating: shop.rating,
        totalReviews: shop.reviewCount,
        address: shop.address,
        city: 'İstanbul',
        district: 'Kadıköy',
        phoneNumber: shop.phoneNumber,
        categoryId: category.id,
        openingHours: { create: [{
          day: 'Monday',
          openTime: '08:00',
          closeTime: '22:00'
        }] }
      }
    });
  }

  console.log('Coffee shops imported successfully!');
  await prisma.$disconnect();
}

importCoffeeData().catch(e => {
  console.error(e);
  process.exit(1);
});