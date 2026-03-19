import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const withoutEmbedding = await prisma.business.count({
    where: {
      embedding: null
    }
  })

  console.log({ withoutEmbedding })
}

main().finally(() => prisma.$disconnect())