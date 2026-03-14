import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const bad = await prisma.business.findMany({
  where: { averageRating: { gt: 5 } },
  select: { id: true, averageRating: true }
})
console.log('Bozuk kayit:', bad.length)
for (const b of bad) {
  let r = b.averageRating
  const digits = Math.floor(Math.log10(r))
  r = r / Math.pow(10, digits - 0)
  r = Math.min(5, Math.max(0, parseFloat(r.toFixed(1))))
  await prisma.business.update({ where: { id: b.id }, data: { averageRating: r } })
}
console.log('Duzeltildi!')
await prisma.$disconnect()