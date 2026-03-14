import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
await prisma.$connect()
await prisma.business.update({
  where: { id: "cmm1com130001z13eqxim6uz9" },
  data: { ownerId: "cmmlxa6i20000gforhrj12ey9" }
})
console.log("Sahip guncellendi!")
await prisma.$disconnect()