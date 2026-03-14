import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
await prisma.$connect()
const b = await prisma.business.findFirst({ 
  where: { attributes: { path: ["about", "Özellikler"], not: { equals: null } } },
  select: { name: true, attributes: true }
})
console.log(JSON.stringify(b?.attributes?.about?.["Özellikler"]))
await prisma.$disconnect()