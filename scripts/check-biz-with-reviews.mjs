import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const withReviews = await prisma.business.count({
    where: {
      reviews: {
        some: {}
      }
    }
  })

  const withEmbedding = await prisma.business.count({
    where: {
      embedding: {
        isNot: null
      }
    }
  })

  console.log({ withReviews, withEmbedding })
}

main().finally(() => prisma.$disconnect())