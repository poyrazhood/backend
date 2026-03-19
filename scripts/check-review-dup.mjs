import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const data = await prisma.reviewEmbedding.groupBy({
    by: ['reviewId'],
    _count: {
      reviewId: true
    },
    orderBy: {
      _count: {
        reviewId: 'desc'
      }
    },
    take: 10
  })

  console.log(data)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())