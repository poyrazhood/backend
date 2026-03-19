import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const reviewCount = await prisma.review.count()
  const reviewEmbeddingCount = await prisma.reviewEmbedding.count()
  const businessCount = await prisma.business.count()
  const businessEmbeddingCount = await prisma.businessEmbedding.count()
  const businessQACount = await prisma.businessQA.count()

  console.log({
    reviewCount,
    reviewEmbeddingCount,
    businessCount,
    businessEmbeddingCount,
    businessQACount
  })
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())