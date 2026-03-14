import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
await prisma.$connect()
const b = await prisma.business.findFirst({ where: { id: "cmm1com130001z13eqxim6uz9" }, select: { name: true, city: true, district: true } })
console.log(JSON.stringify(b))
await prisma.$disconnect()