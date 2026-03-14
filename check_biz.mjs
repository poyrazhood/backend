import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
await prisma.$connect()

const all = await prisma.business.findMany({
  where: { isDeleted: false },
  select: { id: true, name: true, isActive: true, isVerified: true, createdAt: true },
  orderBy: { createdAt: 'desc' },
  take: 10
})
console.log(JSON.stringify(all, null, 2))
await prisma.$disconnect()
