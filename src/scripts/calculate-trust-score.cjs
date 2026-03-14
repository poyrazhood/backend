const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const weights = {
  Review: 0.4,
  Verification: 0.3,
  Engagement: 0.3
};

async function calculateTrustScores() {
  const businesses = await prisma.business.findMany();

  for (const business of businesses) {
    // Örnek değerler, güncel değerlendirmeleri gerçek verilerle almak gerekebilir
    const trustScore = (business.averageRating * weights.Review) + 
                       ((business.totalReviews > 0 ? 1 : 0) * weights.Verification) + 
                       ((business.totalViews > 0 ? 1 : 0) * weights.Engagement);

    await prisma.business.update({
      where: { id: business.id },
      data: { trustScore: trustScore }
    });
  }

  console.log('Trust scores updated successfully!');
  await prisma.$disconnect();
}

calculateTrustScores().catch(e => {
  console.error(e);
  process.exit(1);
});