import prisma from './src/lib/prisma.js'

const search = 'kafe'
const where = {
  isActive: true,
  isDeleted: false,
  OR: [
    { name: { contains: search, mode: 'insensitive' } },
    { district: { contains: search, mode: 'insensitive' } },
  ]
}

console.time('findMany_regular')
const r1 = await prisma.business.findMany({
  where: { ...where, subscriptionPlan: { notIn: ['PREMIUM', 'ENTERPRISE'] } },
  orderBy: { totalReviews: 'desc' },
  skip: 0, take: 20,
  select: { id: true, name: true, city: true }
})
console.timeEnd('findMany_regular')
console.log('regular count:', r1.length)

console.time('findMany_boosted')
const r2 = await prisma.business.findMany({
  where: { ...where, subscriptionPlan: { in: ['PREMIUM', 'ENTERPRISE'] } },
  orderBy: { totalReviews: 'desc' },
  take: 5,
  select: { id: true, name: true, city: true }
})
console.timeEnd('findMany_boosted')
console.log('boosted count:', r2.length)

console.time('count')
const total = await prisma.business.count({ where })
console.timeEnd('count')
console.log('total:', total)

// Raw SQL ile karşılaştır
console.time('raw_sql')
const raw = await prisma.$queryRaw`
  SELECT id, name, city FROM "Business"
  WHERE "isActive" = true AND "isDeleted" = false
  AND (name ILIKE ${'%kafe%'} OR district ILIKE ${'%kafe%'})
  ORDER BY "totalReviews" DESC
  LIMIT 20
`
console.timeEnd('raw_sql')
console.log('raw count:', raw.length)

await prisma.$disconnect()
