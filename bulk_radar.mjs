import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
await prisma.$connect()

const businesses = await prisma.business.findMany({
  where: { category: { slug: { contains: "oto" } } },
  select: { id: true, name: true }
})

console.log(businesses.length + " isletme bulundu")

for (const b of businesses) {
  const reviews = await prisma.$queryRawUnsafe(
    `SELECT rating, "sentimentKeywords" FROM "Review" WHERE "businessId" = $1 AND "isPublished" = true`,
    b.id
  )
  if (reviews.length === 0) { console.log("Yorum yok:", b.name); continue }

  const avgRating = reviews.reduce((a, r) => a + r.rating, 0) / reviews.length
  const allKeywords = reviews.flatMap(r => r.sentimentKeywords || []).map(k => k.toLowerCase())
  const has = (words) => words.some(w => allKeywords.some(k => k.includes(w)))
  const base = (avgRating / 5) * 100

  await prisma.$executeRawUnsafe(
    `INSERT INTO "AutoServiceProfile" ("id", "businessId", "scoreTeknikYetkinlik", "scoreFiyatSeffagligi", "scoreMusteriIliskileri", "scoreGaranti", "totalRatings", "lastCalculatedAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, NOW(), NOW())
     ON CONFLICT ("businessId") DO UPDATE SET
       "scoreTeknikYetkinlik"   = $2,
       "scoreFiyatSeffagligi"   = $3,
       "scoreMusteriIliskileri" = $4,
       "scoreGaranti"           = $5,
       "totalRatings"           = $6,
       "lastCalculatedAt"       = NOW(),
       "updatedAt"              = NOW()`,
    b.id,
    Math.min(has(['teşhis','tamir','teknik','çözdü']) ? base+10 : base, 100),
    Math.min(has(['fiyat','ücret','uygun','şeffaf']) ? base+8 : base*0.9, 100),
    Math.min(has(['nazik','ilgili','iletişim','güler']) ? base+12 : base, 100),
    Math.min(has(['garanti','geri','sorun','destek']) ? base+5 : base*0.85, 100),
    reviews.length
  )
  console.log("Guncellendi:", b.name, "| avg:", avgRating.toFixed(1), "| yorumlar:", reviews.length)
}

await prisma.$disconnect()
console.log("Tamamlandi!")