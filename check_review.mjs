import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
await prisma.$connect()
const review = await prisma.review.findUnique({
  where: { id: "cmmn9chjp000797o6eqt2oq27" },
  include: { business: { select: { ownerId: true, name: true } } }
})
console.log(JSON.stringify(review))
await prisma.$disconnect()