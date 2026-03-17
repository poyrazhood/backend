import prisma from './src/lib/prisma.js'

const indexes = await prisma.$queryRaw`
  SELECT indexname, indexdef 
  FROM pg_indexes 
  WHERE tablename = 'Business' AND indexdef LIKE '%trgm%'
`
console.log('Trigram indexes:', JSON.stringify(indexes, null, 2))

// ILIKE hız testi (mevcut)
console.time('ilike')
await prisma.$queryRaw`
  SELECT id, name FROM "Business"
  WHERE name ILIKE ${'%kafe%'}
  LIMIT 5
`
console.timeEnd('ilike')

// to_tsvector full-text search testi
console.time('fts')
await prisma.$queryRaw`
  SELECT id, name FROM "Business"
  WHERE to_tsvector('turkish', name) @@ plainto_tsquery('turkish', ${'kafe'})
  LIMIT 5
`
console.timeEnd('fts')

// similarity testi
console.time('similarity')
await prisma.$queryRaw`
  SELECT id, name, similarity(name, ${'kafe'}) as sim
  FROM "Business"
  WHERE similarity(name, ${'kafe'}) > 0.1
  ORDER BY sim DESC
  LIMIT 5
`
console.timeEnd('similarity')

await prisma.$disconnect()
