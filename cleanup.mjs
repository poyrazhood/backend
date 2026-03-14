import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
await prisma.$connect()

// isletme ekle ve Epos Medya duplikatlarini sil (sadece test olanlari)
const deleted = await prisma.business.updateMany({
  where: {
    name: { in: ['isletme ekle', 'Epos Medya', 'test isletme ekle'] },
    ownerId: 'cmmlxa6i20000gforhrj12ey9',
    isVerified: false,
  },
  data: { isDeleted: true, isActive: false }
})
console.log('Silindi:', deleted.count)
await prisma.$disconnect()
