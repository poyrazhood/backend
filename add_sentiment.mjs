import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
await prisma.$connect()
await prisma.$executeRawUnsafe(`ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "sentiment" TEXT`)
await prisma.$executeRawUnsafe(`ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "sentimentScore" FLOAT`)
await prisma.$executeRawUnsafe(`ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "sentimentKeywords" TEXT[]`)
console.log("Sentiment kolonlari eklendi!")
await prisma.$disconnect()