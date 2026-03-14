import { writeFileSync } from "fs"

const routes = `
import { PrismaClient } from '@prisma/client'
import { analyzeSentiment } from '../services/sentimentService.js'

const prisma = new PrismaClient()
const AUTO_SERVICE_CATEGORY_ID = 'cmm1c5s5x002110hucciownsa'

// Yorumlardan otomatik radar skoru hesapla
async function calculateRadarScores(businessId) {
  const reviews = await prisma.$queryRawUnsafe(
    \`SELECT content, rating, "sentimentKeywords" FROM "Review" 
     WHERE "businessId" = $1 AND "isPublished" = true\`,
    businessId
  )
  if (reviews.length === 0) return null

  const avgRating = reviews.reduce((a, r) => a + r.rating, 0) / reviews.length
  const allKeywords = reviews.flatMap(r => r.sentimentKeywords || []).map(k => k.toLowerCase())

  const has = (words) => words.some(w => allKeywords.some(k => k.includes(w)))
  const ratingScore = (avgRating / 5) * 100

  return {
    scoreTeknikYetkinlik: has(['teşhis','tamir','arıza','teknik','doğru','çözdü']) ? Math.min(ratingScore + 10, 100) : ratingScore,
    scoreFiyatSeffafligi: has(['fiyat','fatura','ücret','pahalı','uygun','şeffaf']) ? Math.min(ratingScore + 8, 100) : ratingScore * 0.9,
    scoreMusteriIliskileri: has(['iletişim','nazik','ilgili','açıkladı','güler','saygılı']) ? Math.min(ratingScore + 12, 100) : ratingScore,
    scoreGaranti: has(['garanti','geri','sorun','tekrar','destek']) ? Math.min(ratingScore + 5, 100) : ratingScore * 0.85,
    totalRatings: reviews.length,
    lastCalculatedAt: new Date()
  }
}

async function autoServiceRoutes(fastify) {

  // GET /api/auto-service/:businessId — Radar verisini getir
  fastify.get('/:businessId', async (request, reply) => {
    const { businessId } = request.params
    let profile = await prisma.$queryRawUnsafe(
      \`SELECT * FROM "AutoServiceProfile" WHERE "businessId" = $1\`,
      businessId
    ).then(r => r[0] || null)

    if (!profile) {
      return reply.send({ exists: false, scores: null })
    }
    return reply.send({ exists: true, profile })
  })

  // POST /api/auto-service/:businessId/recalculate — Skorlari yeniden hesapla
  fastify.post('/:businessId/recalculate', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { businessId } = request.params
    const scores = await calculateRadarScores(businessId)
    if (!scores) return reply.code(400).send({ error: 'Yeterli yorum yok.' })

    await prisma.$executeRawUnsafe(
      \`INSERT INTO "AutoServiceProfile" ("id", "businessId", "scoreTeknikYetkinlik", "scoreFiyatSeffafligi", "scoreMusteriIliskileri", "scoreGaranti", "totalRatings", "lastCalculatedAt", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT ("businessId") DO UPDATE SET
         "scoreTeknikYetkinlik" = $2, "scoreFiyatSeffagligi" = $3,
         "scoreMusteriIliskileri" = $4, "scoreGaranti" = $5,
         "totalRatings" = $6, "lastCalculatedAt" = $7, "updatedAt" = NOW()\`,
      businessId, scores.scoreTeknikYetkinlik, scores.scoreFiyatSeffagligi,
      scores.scoreMusteriIliskileri, scores.scoreGaranti,
      scores.totalRatings, scores.lastCalculatedAt
    )
    return reply.send({ ok: true, scores })
  })

  // PATCH /api/auto-service/:businessId/manual — Sahip manuel guncelleme
  fastify.patch('/:businessId/manual', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { businessId } = request.params
    const userId = request.user.userId
    const { ustaSicili, liftSayisi, garantiSuresiAy, sertifikalar, uzmanlikAlanlari, scoreEkipman, scoreTecrube } = request.body || {}

    const business = await prisma.business.findFirst({ where: { id: businessId, ownerId: userId } })
    if (!business) return reply.code(403).send({ error: 'Yetkisiz.' })

    await prisma.$executeRawUnsafe(
      \`INSERT INTO "AutoServiceProfile" ("id", "businessId", "ustaSicili", "liftSayisi", "garantiSuresiAy", "sertifikalar", "uzmanlikAlanlari", "scoreEkipman", "scoreTecrube", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT ("businessId") DO UPDATE SET
         "ustaSicili" = COALESCE($2, "AutoServiceProfile"."ustaSicili"),
         "liftSayisi" = COALESCE($3, "AutoServiceProfile"."liftSayisi"),
         "garantiSuresiAy" = COALESCE($4, "AutoServiceProfile"."garantiSuresiAy"),
         "sertifikalar" = COALESCE($5, "AutoServiceProfile"."sertifikalar"),
         "uzmanlikAlanlari" = COALESCE($6, "AutoServiceProfile"."uzmanlikAlanlari"),
         "scoreEkipman" = COALESCE($7, "AutoServiceProfile"."scoreEkipman"),
         "scoreTecrube" = COALESCE($8, "AutoServiceProfile"."scoreTecrube"),
         "updatedAt" = NOW()\`,
      businessId, ustaSicili ?? null, liftSayisi ?? null, garantiSuresiAy ?? null,
      sertifikalar ?? null, uzmanlikAlanlari ?? null, scoreEkipman ?? null, scoreTecrube ?? null
    )
    return reply.send({ ok: true })
  })
}

export default autoServiceRoutes
`

writeFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/autoServiceRoutes.js", routes, "utf8")
console.log("autoServiceRoutes.js olusturuldu!")