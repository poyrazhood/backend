import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
await prisma.$connect()
const user = await prisma.user.findUnique({ where: { username: "poyraz" }, select: { id: true, username: true, badgeLevel: true, trustLevel: true } })
console.log(JSON.stringify(user))
await prisma.$disconnect()