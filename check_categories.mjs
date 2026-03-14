import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
await prisma.$connect()
const categories = await prisma.category.findMany({ select: { id: true, name: true, slug: true } })
console.log(JSON.stringify(categories, null, 2))
await prisma.$disconnect()