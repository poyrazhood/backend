import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
await prisma.$connect()

// Mevcut badge tipleri
const badges = await prisma.$queryRawUnsafe(`SELECT DISTINCT type FROM "BusinessBadge" LIMIT 20`)
console.log("Mevcut badge tipleri:", JSON.stringify(badges))

// isVerified durumu
const verified = await prisma.business.count({ where: { isVerified: true } })
const total = await prisma.business.count()
console.log("Toplam isletme:", total)
console.log("Dogrulanmis:", verified)

await prisma.$disconnect()