import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
await prisma.$connect()

const enums = await prisma.$queryRawUnsafe(`SELECT typname FROM pg_type WHERE typcategory = 'E'`)
console.log("DB enumlari:", JSON.stringify(enums))

await prisma.$disconnect()