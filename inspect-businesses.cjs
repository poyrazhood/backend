const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const businesses = await prisma.business.findMany({
    select: {
      id: true,
      name: true,
      averageRating: true,
      totalReviews: true,
      isVerified: true,
      totalViews: true,
      website: true,
      latitude: true,
      longitude: true,
      googlePlaceId: true,
      phoneNumber: true,
      attributes: true,
      externalReviews: {
        select: { rating: true, content: true, authorName: true },
        take: 3
      }
    }
  });

  console.log(`\nToplam ${businesses.length} işletme:\n`);
  
  businesses.forEach(b => {
    const attrs = b.attributes || {};
    console.log(`━━━ ${b.name} ━━━`);
    console.log(`  averageRating : ${b.averageRating}`);
    console.log(`  totalReviews  : ${b.totalReviews}`);
    console.log(`  totalViews    : ${b.totalViews}`);
    console.log(`  isVerified    : ${b.isVerified}`);
    console.log(`  website       : ${b.website || 'YOK'}`);
    console.log(`  phone         : ${b.phoneNumber || 'YOK'}`);
    console.log(`  lat/lng       : ${b.latitude}/${b.longitude}`);
    console.log(`  googlePlaceId : ${b.googlePlaceId || 'YOK'}`);
    console.log(`  trustScore    : ${attrs.trustScore || 'hesaplanmamış'}`);
    console.log(`  externalReviews: ${b.externalReviews.length} adet`);
    console.log('');
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
