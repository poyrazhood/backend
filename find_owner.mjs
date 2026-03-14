import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
await prisma.$connect()
const b = await prisma.business.findUnique({
  where: { id: "cmm1com130001z13eqxim6uz9" },
  select: { ownerId: true, owner: { select: { email: true, username: true } } }
})
console.log(JSON.stringify(b))
await prisma.$disconnect()