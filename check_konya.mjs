import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
await prisma.$connect()

// Konya yakininda koordinati olan isletme sayisi
const count = await prisma.business.count({
  where: {
    latitude: { gte: 37.5, lte: 38.2 },
    longitude: { gte: 32.0, lte: 33.5 }
  }
})
console.log("Konya bolgesi isletme:", count)

// Bu isletmelere ait external review sayisi
const bizIds = await prisma.business.findMany({
  where: { latitude: { gte: 37.5, lte: 38.2 }, longitude: { gte: 32.0, lte: 33.5 } },
  select: { id: true },
  take: 100
})
const revCount = await prisma.externalReview.count({
  where: { businessId: { in: bizIds.map(b => b.id) }, isVisible: true }
})
console.log("Bu isletmelerin yorumlari:", revCount)
await prisma.$disconnect()