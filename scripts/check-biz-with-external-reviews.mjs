import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const withExternalReviews = await prisma.business.count({
    where: {
      externalReviews: {
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

  console.log({ withExternalReviews, withEmbedding })
}

main().finally(() => prisma.$disconnect())