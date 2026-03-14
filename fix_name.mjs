import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
await prisma.$connect()
await prisma.business.update({ where: { id: "cmm1com130001z13eqxim6uz9" }, data: { name: "Aladaş Teras Cafe" } })
console.log("Isim duzeltildi!")
await prisma.$disconnect()