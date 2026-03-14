import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
await prisma.$connect()
const user = await prisma.user.findFirst({ where: { username: "testuser2" }, select: { id: true } })
await prisma.business.update({
  where: { id: "cmm1com130001z13eqxim6uz9" },
  data: { ownerId: user.id }
})
console.log("Sahip atandi:", user.id)
await prisma.$disconnect()