import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
await prisma.$connect()
const businesses = await prisma.business.findMany({
  where: { category: { slug: { contains: "oto" } } },
  select: { id: true, name: true, slug: true, category: { select: { slug: true } } },
  take: 5
})
console.log(JSON.stringify(businesses, null, 2))
await prisma.$disconnect()