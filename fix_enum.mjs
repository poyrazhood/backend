import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
await prisma.$connect()

const enumValues = ['VERIFIED_GOOGLE', 'VERIFIED_EMAIL', 'VERIFIED_SMS', 'VERIFIED_ADDRESS', 'VERIFIED_PLATINUM']
for (const val of enumValues) {
  try {
    await prisma.$executeRawUnsafe(`ALTER TYPE "BusinessBadgeType" ADD VALUE IF NOT EXISTS '${val}'`)
    console.log("Eklendi:", val)
  } catch(e) {
    console.log("Hata:", val, e.message)
  }
}

console.log("Tamamlandi!")
await prisma.$disconnect()