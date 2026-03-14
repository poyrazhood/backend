import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
await prisma.$connect()
const users = await prisma.user.findMany({ select: { id: true, email: true, username: true }, take: 10 })
users.forEach(u => console.log(JSON.stringify(u)))
await prisma.$disconnect()