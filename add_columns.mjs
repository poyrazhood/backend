import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
await prisma.$connect()
await prisma.$executeRawUnsafe(`ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "ownerReply" TEXT`)
await prisma.$executeRawUnsafe(`ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "ownerReplyDate" TIMESTAMP`)
console.log("Kolonlar eklendi!")
await prisma.$disconnect()