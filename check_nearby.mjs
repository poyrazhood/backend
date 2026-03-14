import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
await prisma.$connect()
const nearby = await prisma.business.findMany({
  where: {
    latitude: { gte: 37.3667, lte: 38.3667 },
    longitude: { gte: 31.9833, lte: 32.9833 },
    isActive: true, isDeleted: false,
  },
  select: { id: true, name: true, city: true, latitude: true, longitude: true },
  take: 5
})
console.log("Yakin isletmeler:", JSON.stringify(nearby, null, 2))
const revCount = await prisma.externalReview.count({
  where: { businessId: { in: nearby.map(b => b.id) }, isVisible: true }
})
console.log("Yorum sayisi:", revCount)
await prisma.$disconnect()