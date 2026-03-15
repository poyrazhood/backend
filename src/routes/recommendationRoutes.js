// src/routes/recommendationRoutes.js
// "Bana GÃ¶re Ã–ner" â€” pgvector tabanlÄ± hibrit Ã¶neri sistemi
// Skor = Semantik Benzerlik (%50) + Konum YakÄ±nlÄ±ÄŸÄ± (%30) + TrustScore (%20)

import prisma from '../lib/prisma.js'

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

function proximityScore(distKm, maxKm = 15) {
  if (distKm > maxKm) return 0
  return 1 - (distKm / maxKm)
}

export default async function recommendationRoutes(fastify) {

  fastify.get('/for-me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const userId = request.user.userId
    const { lat, lng, limit = 10, radius = 15 } = request.query

    try {
      const userEmb = await prisma.userEmbedding.findUnique({
        where:  { userId },
        select: { vector: true, reviewCount: true },
      })

      if (!userEmb?.vector?.length) {
        return reply.send({
          recommendations: [],
          meta: { hasProfile: false, message: 'HenÃ¼z yeterli yorum yok. BirkaÃ§ yorum yaz, seni tanÄ±yalÄ±m!' }
        })
      }

      const blockedCats   = await prisma.userPreference.findMany({ where: { userId, isBlocked: true }, select: { categoryId: true } })
      const blockedCatIds = blockedCats.map(b => b.categoryId)
      const userVecStr    = '[' + userEmb.vector.join(',') + ']'

      const blockSql = blockedCatIds.length
        ? `AND b."categoryId" NOT IN (${blockedCatIds.map((_, i) => `$${i + 2}`).join(',')})`
        : ''

      const sql = `
        SELECT
          b.id, b.name, b.slug, b.city, b.district,
          b."averageRating", b."totalReviews",
          b.latitude, b.longitude,
          b."categoryId",
          c.name AS "categoryName", c.icon AS "categoryIcon",
          1 - (be.embedding <=> $1::vector) AS semantic
        FROM "Business" b
        JOIN "BusinessEmbedding" be ON be."businessId" = b.id
        JOIN "Category" c ON c.id = b."categoryId"
        WHERE b."isActive" = true AND b."isDeleted" = false
          ${blockSql}
        ORDER BY be.embedding <=> $1::vector
        LIMIT 2000
      `

      const rows = await prisma.$queryRawUnsafe(sql, userVecStr, ...blockedCatIds)

      if (!rows.length) {
        return reply.send({ recommendations: [], meta: { hasProfile: true, message: 'Ä°ÅŸletme bulunamadÄ±.' } })
      }

      const latNum      = parseFloat(lat)
      const lngNum      = parseFloat(lng)
      const hasLocation = !isNaN(latNum) && !isNaN(lngNum)
      const maxRadius   = parseFloat(radius)

      const scored = []
      for (const row of rows) {
        const semantic = parseFloat(row.semantic) || 0
        let proximity  = 0.5
        let distKm     = null

        if (hasLocation && row.latitude && row.longitude) {
          distKm = haversine(latNum, lngNum, parseFloat(row.latitude), parseFloat(row.longitude))
          if (distKm > maxRadius) continue
          proximity = proximityScore(distKm, maxRadius)
        }

        const trust      = Math.min((parseFloat(row.averageRating) || 0) / 5, 1)
        const finalScore = (semantic * 0.50) + (proximity * 0.30) + (trust * 0.20)
        scored.push({ row, semantic, proximity, trust, finalScore, distKm })
      }

      scored.sort((a, b) => b.finalScore - a.finalScore)
      const top = scored.slice(0, parseInt(limit))

      const recommendations = top.map(({ row, semantic, proximity, trust, finalScore, distKm }) => {
        const reasons = []
        if (semantic > 0.7)        reasons.push('Zevklerinizle Ã§ok uyumlu')
        else if (semantic > 0.5)   reasons.push('Ä°lgi alanlarÄ±nÄ±zla Ã¶rtÃ¼ÅŸÃ¼yor')
        else                       reasons.push('BÃ¶lgenizde popÃ¼ler')

        if (distKm !== null) {
          if (distKm < 1) reasons.push(`${Math.round(distKm * 1000)}m yakÄ±nÄ±nÄ±zda`)
          else            reasons.push(`${distKm.toFixed(1)}km uzakta`)
        }

        if (row.averageRating >= 4.5)   reasons.push('Ã‡ok yÃ¼ksek puanlÄ±')
        else if (row.averageRating >= 4) reasons.push('YÃ¼ksek puanlÄ±')
        if (row.totalReviews > 100)      reasons.push(`${row.totalReviews} yorum`)

        return {
          id: row.id, name: row.name, slug: row.slug,
          city: row.city, district: row.district,
          category: { id: row.categoryId, name: row.categoryName, icon: row.categoryIcon },
          averageRating: row.averageRating,
          totalReviews:  row.totalReviews,
          score:         Math.round(finalScore * 100) / 100,
          _reasons: {
            summary:  reasons[0] || 'Sana uygun',
            details:  reasons,
            semantic: Math.round(semantic * 100),
            distance: distKm ? `${distKm.toFixed(1)} km` : null,
            trust:    Math.round(trust * 100),
          }
        }
      })

      return reply.send({
        recommendations,
        meta: {
          hasProfile: true, reviewCount: userEmb.reviewCount,
          totalScored: scored.length, blockedCats: blockedCatIds.length,
          message: `${userEmb.reviewCount} yorumundan kiÅŸiselleÅŸtirildi`,
        }
      })

    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: 'Ã–neri sistemi hatasÄ±: ' + err.message })
    }
  })

  fastify.get('/for-me/status', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const userId = request.user.userId
    const [emb, reviewCount] = await Promise.all([
      prisma.userEmbedding.findUnique({ where: { userId }, select: { reviewCount: true, updatedAt: true } }),
      prisma.review.count({ where: { userId, isPublished: true } })
    ])
    return reply.send({
      hasProfile:     !!emb,
      reviewCount,
      embReviewCount: emb?.reviewCount || 0,
      lastUpdated:    emb?.updatedAt   || null,
      readyForRecs:   (emb?.reviewCount || 0) >= 2,
    })
  })
}
