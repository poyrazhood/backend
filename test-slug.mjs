import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// Duplicate ExternalReview kayıtları temizle
console.log('Duplicate ExternalReview temizleniyor...')
await prisma.$queryRawUnsafe(`
  DELETE FROM "ExternalReview" a
  USING "ExternalReview" b
  WHERE a.id > b.id 
  AND a.source = b.source 
  AND a."sourceId" = b."sourceId"
`)
console.log('Temizlendi! Reindex yapiliyor...')
await prisma.$queryRawUnsafe('REINDEX DATABASE tecrubelerim_db')
console.log('REINDEX tamamlandi!')
await prisma.$disconnect()