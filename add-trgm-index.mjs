import { readFileSync, writeFileSync } from 'fs'

const file = 'C:\\Users\\PC\\Desktop\\tecrubelerim\\prisma\\schema.prisma'
let content = readFileSync(file, 'utf8')

const oldIndexes = `  @@index([slug])
  @@index([categoryId])
  @@index([city, district])
  @@index([averageRating])
  @@index([isActive, isDeleted])
  @@index([latitude, longitude])
  @@index([googlePlaceId])
}`

const newIndexes = `  @@index([slug])
  @@index([categoryId])
  @@index([city, district])
  @@index([averageRating])
  @@index([isActive, isDeleted])
  @@index([latitude, longitude])
  @@index([googlePlaceId])
  @@index([name(ops: raw("gin_trgm_ops"))], type: Gin)
  @@index([city(ops: raw("gin_trgm_ops"))], type: Gin)
  @@index([district(ops: raw("gin_trgm_ops"))], type: Gin)
}`

if (content.includes('gin_trgm_ops')) {
  console.log('⚠️  Trigram indexler zaten mevcut, değişiklik yapılmadı.')
  process.exit(0)
}

if (!content.includes(oldIndexes)) {
  console.error('❌ Business model index bloğu bulunamadı. Schema farklı olabilir.')
  process.exit(1)
}

content = content.replace(oldIndexes, newIndexes)
writeFileSync(file, content, 'utf8')
console.log('✅ Trigram indexler eklendi.')
