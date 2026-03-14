import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
await prisma.$connect()
const b = await prisma.business.findFirst({ where: { subscriptionPlan: "PREMIUM" }, select: { id: true, name: true, slug: true } })
console.log(JSON.stringify(b))
await prisma.$disconnect()