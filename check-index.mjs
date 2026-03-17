import prisma from './src/lib/prisma.js'

const indexes = await prisma.$queryRaw`
  SELECT indexname, indexdef 
  FROM pg_indexes 
  WHERE tablename = 'Business' AND indexdef LIKE '%trgm%'
`
console.log('Trigram indexes (Business):', indexes)

const indexes2 = await prisma.$queryRaw`
  SELECT indexname, indexdef 
  FROM pg_indexes 
  WHERE tablename = 'business' AND indexdef LIKE '%trgm%'
`
console.log('Trigram indexes (business):', indexes2)

// Hız testi
console.time('search')
const result = await prisma.$queryRaw`
  SELECT id, name, city, district
  FROM "Business"
  WHERE name ILIKE ${'%kafe%'}
  LIMIT 5
`
console.timeEnd('search')
console.log('Sonuç sayısı:', result.length)

// Trigram ile hız testi
console.time('trgm_search')
const result2 = await prisma.$queryRaw`
  SELECT id, name, city, district
  FROM "Business"
  WHERE name % ${'kafe'} OR name ILIKE ${'%kafe%'}
  LIMIT 5
`
console.timeEnd('trgm_search')

await prisma.$disconnect()
