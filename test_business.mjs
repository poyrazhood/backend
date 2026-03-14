import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
await prisma.$connect()
const b = await prisma.business.findFirst({
  where: { slug: "kadikoy-oto-tamircisi-724" },
  select: { id: true, isVerified: true, badges: { select: { type: true } } }
})
console.log(JSON.stringify(b))
await prisma.$disconnect()