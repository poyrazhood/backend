import { readFileSync, writeFileSync } from "fs"
let content = readFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/reviewRoutes.js", "utf8")

const radarFn = `
// Radar skorlarini yorumlardan otomatik hesapla
async function recalculateRadar(businessId) {
  const reviews = await prisma.$queryRawUnsafe(
    \`SELECT rating, "sentimentKeywords" FROM "Review" WHERE "businessId" = $1 AND "isPublished" = true\`,
    businessId
  )
  if (reviews.length === 0) return

  const avgRating = reviews.reduce((a, r) => a + r.rating, 0) / reviews.length
  const allKeywords = reviews.flatMap(r => r.sentimentKeywords || []).map(k => k.toLowerCase())
  const has = (words) => words.some(w => allKeywords.some(k => k.includes(w)))
  const base = (avgRating / 5) * 100

  const scores = {
    scoreTeknikYetkinlik:   Math.min(has(['teşhis','tamir','arıza','teknik','çözdü','doğru']) ? base + 10 : base, 100),
    scoreFiyatSeffafligi:   Math.min(has(['fiyat','fatura','ücret','uygun','şeffaf','pahalı']) ? base + 8  : base * 0.9, 100),
    scoreMusteriIliskileri: Math.min(has(['nazik','ilgili','açıkladı','iletişim','güler','saygı']) ? base + 12 : base, 100),
    scoreGaranti:           Math.min(has(['garanti','geri','sorun','tekrar','destek']) ? base + 5 : base * 0.85, 100),
  }

  await prisma.$executeRawUnsafe(
    \`INSERT INTO "AutoServiceProfile" ("id", "businessId", "scoreTeknikYetkinlik", "scoreFiyatSeffagligi", "scoreMusteriIliskileri", "scoreGaranti", "totalRatings", "lastCalculatedAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, NOW(), NOW())
     ON CONFLICT ("businessId") DO UPDATE SET
       "scoreTeknikYetkinlik"   = $2,
       "scoreFiyatSeffagligi"   = $3,
       "scoreMusteriIliskileri" = $4,
       "scoreGaranti"           = $5,
       "totalRatings"           = $6,
       "lastCalculatedAt"       = NOW(),
       "updatedAt"              = NOW()\`,
    businessId, scores.scoreTeknikYetkinlik, scores.scoreFiyatSeffagligi,
    scores.scoreMusteriIliskileri, scores.scoreGaranti, reviews.length
  )
}

`

// import satirindan sonra fonksiyonu ekle
const importEnd = content.indexOf("\n", content.lastIndexOf("^import|^const|^from"))
const firstBlankLine = content.indexOf("\n\n")
content = content.slice(0, firstBlankLine + 2) + radarFn + content.slice(firstBlankLine + 2)

writeFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/reviewRoutes.js", content, "utf8")
console.log("recalculateRadar fonksiyonu eklendi!")