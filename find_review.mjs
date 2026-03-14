import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
await prisma.$connect()
const review = await prisma.review.findFirst({
  where: { isPublished: true },
  select: { id: true, content: true, rating: true, businessId: true, business: { select: { name: true, ownerId: true } } }
})
console.log(JSON.stringify(review))
await prisma.$disconnect()