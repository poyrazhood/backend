import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
await prisma.$connect()

const businesses = await prisma.business.findMany({
  where: { category: { slug: { contains: "oto" } } },
  select: { id: true, name: true }
})

console.log(businesses.length + " isletme bulundu")
let updated = 0

for (const b of businesses) {
  const reviews = await prisma.$queryRawUnsafe(
    `SELECT rating, content FROM "ExternalReview" WHERE "businessId" = $1 AND "isVisible" = true AND content IS NOT NULL`,
    b.id
  )
  if (reviews.length === 0) continue

  const avgRating = reviews.reduce((a, r) => a + r.rating, 0) / reviews.length
  const allText = reviews.map(r => (r.content || "").toLowerCase()).join(" ")
  const has = (words) => words.some(w => allText.includes(w))
  const base = (avgRating / 5) * 100

  await prisma.$executeRawUnsafe(
    `INSERT INTO "AutoServiceProfile" ("id", "businessId", "scoreTeknikYetkinlik", "scoreFiyatSeffafligi", "scoreMusteriIliskileri", "scoreGaranti", "totalRatings", "lastCalculatedAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, NOW(), NOW())
     ON CONFLICT ("businessId") DO UPDATE SET
       "scoreTeknikYetkinlik"   = $2,
       "scoreFiyatSeffafligi"   = $3,
       "scoreMusteriIliskileri" = $4,
       "scoreGaranti"           = $5,
       "totalRatings"           = $6,
       "lastCalculatedAt"       = NOW(),
       "updatedAt"              = NOW()`,
    b.id,
    Math.min(has(['teşhis','tamir','teknik','çözdü','arıza','motor','fren']) ? base+10 : base, 100),
    Math.min(has(['fiyat','ücret','uygun','şeffaf','pahalı','makul']) ? base+8 : base*0.9, 100),
    Math.min(has(['nazik','ilgili','iletişim','güler','saygı','yardımcı']) ? base+12 : base, 100),
    Math.min(has(['garanti','geri','sorun','tekrar','destek']) ? base+5 : base*0.85, 100),
    reviews.length
  )
  updated++
  console.log(`Guncellendi: ${b.name} | avg: ${avgRating.toFixed(1)} | ${reviews.length} yorum`)
}

console.log(`\nTamamlandi! ${updated} isletme guncellendi.`)
await prisma.$disconnect()