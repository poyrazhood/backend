import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function importCoffeeData() {
  const coffeeShops = [
    {
      name: "Walter's Coffee Roastery",
      rating: 4.3,
      reviewCount: 2696,
      address: "Bademaltı Sk. No:21",
      workingHours: "Open · Closes at 23:00",
      phoneNumber: null
    },
    {
      name: "Good Coffee Roasting Co.",
      rating: 4.8,
      reviewCount: 514,
      address: "Okur Sk. No: 16A",
      workingHours: "Open · Closes at 22:00",
      phoneNumber: null
    },
    {
      name: "Coffee Manifesto",
      rating: 4.5,
      reviewCount: 600,
      address: "Güneşlibahçe Sok. No:40A",
      workingHours: "Open · Closes at 21:00",
      phoneNumber: null
    },
    {
      name: "Urban Roastery",
      rating: 4.6,
      reviewCount: 274,
      address: "Şevki Bey Sk. No:2/A",
      workingHours: "Open · Closes at 22:30",
      phoneNumber: null
    },
    {
      name: "Story Coffee & Roastery",
      rating: 4.5,
      reviewCount: 415,
      address: "Halitağa Cd. no 61",
      workingHours: "Open · Closes at 22:30",
      phoneNumber: null
    },
    {
      name: "Meet Lab Coffee",
      rating: 4.6,
      reviewCount: 225,
      address: "Ruşen Ağa Sk. No:11 / A",
      workingHours: "Open · Closes at 00:00",
      phoneNumber: null
    },
    {
      name: "Meet Lab Coffee",
      rating: 4.3,
      reviewCount: 320,
      address: "Plaj Yolu Sk. No:18, 34740",
      workingHours: "Open · Closes at 00:00",
      phoneNumber: null
    }
  ];

  for (const shop of coffeeShops) {
    await prisma.business.create({
      data: {
        name: shop.name,
        averageRating: shop.rating,
        totalReviews: shop.reviewCount,
        address: shop.address,
        openingHours: [{ day: 'Monday', openTime: shop.workingHours.split(' · ')[0], closeTime: shop.workingHours.split(' · ')[1] }],
        phoneNumber: shop.phoneNumber,
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