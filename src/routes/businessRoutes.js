import prisma from '../lib/prisma.js'
import {
  buildCacheKey,
  getCache,
  setCache,
  invalidateCache,
} from '../lib/memoryCache.js'
import { generateSlug, generateUniqueSlug } from '../utils/slugify.js'

// ─── Yardımcı: Puan ver ───────────────────────────────────────────────────────
async function awardPoints(userId, points, reason, refId = '') {
  try {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          currentPoints:     { increment: points },
          totalEarnedPoints: { increment: points },
        },
      }),
      prisma.marketPointLog.create({
        data: {
          userId,
          points,
          reason: reason.toUpperCase(),
          description:
            reason === 'business_added'
              ? `İşletme ekleme ödülü (+50 TP)${refId ? ' [' + refId + ']' : ''}`
              : reason,
        },
      }),
    ])
  } catch (e) {
    console.error('awardPoints error:', e.message)
  }
}

// ─── Homepage feed için hafif select ─────────────────────────────────────────
// attributes, owner, externalReviews._count gibi ağır alanlar çıkarıldı.
// 500kb → ~25kb
const FEED_SELECT = {
  id:               true,
  name:             true,
  slug:             true,
  city:             true,
  district:         true,
  averageRating:    true,
  totalReviews:     true,
  photos: {
    select:  { url: true, order: true },
    orderBy: { order: 'asc' },
    take:    1,
  },
  claimStatus:      true,
  isVerified:       true,
  verificationLevel:true,
  subscriptionPlan: true,
  trustScore:       true,
  trustGrade:       true,
  category: {
    select: { id: true, name: true, slug: true, icon: true },
  },
}

async function businessRoutes(fastify) {

  // ─── GET /count ──────────────────────────────────────────────────────────────
  fastify.get('/count', async (request, reply) => {
    const { city } = request.query

    if (city) {
      const cacheKey = `business:count:${city.toLowerCase()}`
      const cached = getCache(cacheKey)
      if (cached !== null) return reply.send(cached)

      const total = await prisma.business.count({
        where: { isDeleted: false, city: { contains: city, mode: 'insensitive' } },
      })
      setCache(cacheKey, { total }, 300) // 5 dakika
      return reply.send({ total })
    }

    const cached = getCache('business:count')
    if (cached !== null) return reply.send(cached)

    const total = await prisma.business.count({ where: { isDeleted: false } })
    setCache('business:count', { total }, 120)
    return reply.send({ total })
  })

  // ─── GET /cities-stats — Tüm şehirlerin işletme sayısı ──────────────────────
  fastify.get('/cities-stats', async (request, reply) => {
    const cacheKey = 'business:cities-stats'
    const cached = getCache(cacheKey)
    if (cached !== null) return reply.send(cached)

    const rows = await prisma.business.groupBy({
      by: ['city'],
      where: { isDeleted: false, isActive: true },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    })

    const data = rows.map(r => ({ city: r.city, count: r._count.id }))
    setCache(cacheKey, { data }, 300) // 5 dakika
    return reply.send({ data })
  })

  // ─── GET / — İşletme Listesi (FEED) ─────────────────────────────────────────
  fastify.get('/', { preHandler: [fastify.optionalAuth] }, async (request, reply) => {
    const {
      page = 1, limit = 20,
      city, district, categoryId, categorySlug,
      sort = 'rating',
      minRating, search, lat, lng, radiusKm = 30,
    } = request.query

    const take = Math.min(parseInt(limit), request.query._sitemap ? 10000 : 50)
    const skip = (parseInt(page) - 1) * take

    // Cache sadece filtre içermeyen genel feed'e uygulanır
    const isGenericFeed = !city && !district && !categoryId && !categorySlug
      && !minRating && !search && !lat && !lng

    const cacheKey = isGenericFeed
      ? buildCacheKey('feed', { sort, page, limit: take })
      : null

    if (cacheKey) {
      const cached = getCache(cacheKey)
      if (cached) {
        reply.header('X-Cache', 'HIT')
        return reply.code(200).send(cached)
      }
    }

    // ── Where koşulu ──────────────────────────────────────────────────────────
    const where = {
      isActive:  true,
      isDeleted: false,
      ...(city         && { city:     { contains: city,     mode: 'insensitive' } }),
      ...(district     && { district: { contains: district, mode: 'insensitive' } }),
      ...(categoryId   && { categoryId }),
      ...(categorySlug && { category: { slug: categorySlug } }),
      ...(minRating    && { averageRating: { gte: parseFloat(minRating) } }),
      ...(search && {
        OR: [
          { name:        { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { district:    { contains: search, mode: 'insensitive' } },
        ],
      }),
    }

    if (lat && lng) {
      const userLat = parseFloat(lat)
      const userLng = parseFloat(lng)
      const km = parseFloat(radiusKm) || 30
      where.latitude  = { gte: userLat - km / 111.0, lte: userLat + km / 111.0 }
      where.longitude = { gte: userLng - km / 85.0,  lte: userLng + km / 85.0 }
    }

    // ── Sıralama ──────────────────────────────────────────────────────────────
    const orderBy =
      sort === 'newest'       ? { createdAt: 'desc' }    :
      sort === 'mostReviewed' ? { totalReviews: 'desc' } :
                                { averageRating: 'desc' }

    const boostedWhere = { ...where, subscriptionPlan: { in: ['PREMIUM', 'ENTERPRISE'] } }
    const regularWhere = { ...where, subscriptionPlan: { notIn: ['PREMIUM', 'ENTERPRISE'] } }

    try {
      const [boosted, regular, total] = await Promise.all([
        prisma.business.findMany({ where: boostedWhere, orderBy, take: 5, select: FEED_SELECT }),
        prisma.business.findMany({ where: regularWhere, orderBy, skip, take, select: FEED_SELECT }),
        prisma.business.count({ where }),
      ])

      const boostedIds = new Set(boosted.map((b) => b.id))
      const businesses = [...boosted, ...regular.filter((b) => !boostedIds.has(b.id))]

      const payload = {
        data: businesses,
        pagination: {
          page:       parseInt(page),
          limit:      take,
          total,
          totalPages: Math.ceil(total / take),
        },
      }

      if (cacheKey) {
        setCache(cacheKey, payload, 60) // 60 saniye
        reply.header('X-Cache', 'MISS')
      }

      return reply.code(200).send(payload)
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: 'İşletmeler alınamadı.' })
    }
  })

  // ─── GET /:slug — İşletme Detayı ─────────────────────────────────────────────
  fastify.get('/:slug', { preHandler: [fastify.optionalAuth] }, async (request, reply) => {
    const { slug } = request.params

    try {
      const business = await prisma.business.findFirst({
        where: { slug },
        include: {
          category: true,
          photos:   { orderBy: { order: 'asc' }, take: 10 },
          badges:   { where: { isActive: true }, select: { type: true, awardedAt: true } },
          owner: {
            select: {
              id: true, username: true, fullName: true,
              avatarUrl: true, badgeLevel: true,
            },
          },
          reviews: {
            where:   { isPublished: true },
            orderBy: { createdAt: 'desc' },
            take:    10,
            include: {
              user: {
                select: {
                  id: true, username: true, fullName: true,
                  avatarUrl: true, trustScore: true, trustLevel: true, badgeLevel: true,
                },
              },
              photos: true,
            },
          },
          openingHours:    { orderBy: { day: 'asc' } },
          externalReviews: {
            where:   { isVisible: true },
            orderBy: { publishedAt: 'desc' },
            take:    30,
          },
        },
      })

      if (!business || business.isDeleted) {
        return reply.code(404).send({ error: 'İşletme bulunamadı.' })
      }

      prisma.business.update({
        where: { id: business.id },
        data:  { totalViews: { increment: 1 } },
      }).catch(() => {})

      const ratingDist = await prisma.review.groupBy({
        by:    ['rating'],
        where: { businessId: business.id, isPublished: true },
        _count:{ rating: true },
      })
      const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
      ratingDist.forEach((r) => { ratingDistribution[r.rating] = r._count.rating })

      return reply.code(200).send({ ...business, ratingDistribution })
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: 'İşletme alınamadı.' })
    }
  })

  // ─── POST / — İşletme Oluştur ─────────────────────────────────────────────────
  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const {
      name, address, city, district, categoryId, description,
      phoneNumber, email, website, attributes,
    } = request.body || {}

    if (!name || !address || !city || !categoryId) {
      return reply.code(400).send({ error: 'Ad, adres, şehir ve kategori zorunludur.' })
    }

    try {
      const baseSlug = generateSlug(name)
      const slug = await generateUniqueSlug(baseSlug, async (s) => {
        return !!(await prisma.business.findFirst({ where: { slug: s } }))
      })

      const business = await prisma.business.create({
        data: {
          name, slug, address, city, district, categoryId,
          description, phoneNumber, email, website,
          attributes: attributes || {},
          isActive:   false,
          isVerified: false,
          ownerId:    request.user.userId,
        },
        include: { category: true },
      })

      invalidateCache('feed:')
      invalidateCache('business:count')

      return reply.code(201).send({
        message: 'İşletmeniz incelemeye alındı. Onaylandıktan sonra yayınlanacak.',
        business,
      })
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: 'İşletme oluşturulamadı.' })
    }
  })

  // ─── GET /:id/reviews ─────────────────────────────────────────────────────────
  fastify.get('/:id/reviews', { preHandler: [fastify.optionalAuth] }, async (request, reply) => {
    const { id } = request.params
    const { page = 1, limit = 10, sort = 'newest', rating } = request.query

    const take = Math.min(parseInt(limit), 50)
    const skip = (parseInt(page) - 1) * take

    const orderBy =
      sort === 'helpful'     ? { helpfulCount: 'desc' } :
      sort === 'rating_high' ? { rating: 'desc' }       :
      sort === 'rating_low'  ? { rating: 'asc' }        :
                               { createdAt: 'desc' }

    try {
      const where = {
        businessId: id, isPublished: true, isFlagged: false,
        ...(rating && { rating: parseInt(rating) }),
      }

      const [reviews, total] = await Promise.all([
        prisma.review.findMany({
          where, orderBy, skip, take,
          include: {
            user: {
              select: {
                id: true, username: true, fullName: true,
                avatarUrl: true, trustScore: true, trustLevel: true, badgeLevel: true,
              },
            },
            photos: true,
          },
        }),
        prisma.review.count({ where }),
      ])

      return reply.code(200).send({
        data: reviews,
        pagination: { page: parseInt(page), limit: take, total, totalPages: Math.ceil(total / take) },
      })
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: 'Yorumlar alınamadı.' })
    }
  })

  // ─── POST/DELETE /:id/save ────────────────────────────────────────────────────
  fastify.post('/:id/save', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params
    try {
      const business = await prisma.business.findFirst({ where: { id }, select: { id: true } })
      if (!business) return reply.code(404).send({ error: 'İşletme bulunamadı.' })

      const existing = await prisma.savedBusiness.findUnique({
        where: { userId_businessId: { userId: request.user.userId, businessId: id } },
      })
      if (existing) return reply.code(400).send({ error: 'Zaten kaydedilmiş.' })

      await prisma.savedBusiness.create({ data: { userId: request.user.userId, businessId: id } })
      return reply.code(201).send({ saved: true })
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: 'Kaydetme işlemi başarısız.' })
    }
  })

  fastify.delete('/:id/save', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params
    try {
      await prisma.savedBusiness.deleteMany({
        where: { userId: request.user.userId, businessId: id },
      })
      return reply.code(200).send({ saved: false })
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: 'Kayıt silme başarısız.' })
    }
  })

  // ─── GET /:id/analytics ───────────────────────────────────────────────────────
  fastify.get('/:id/analytics', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params
    const userId = request.user.id

    const business = await prisma.business.findFirst({
      where:  { id, ownerId: userId, isDeleted: false },
      select: {
        id: true, name: true, totalViews: true, totalReviews: true,
        averageRating: true, city: true, district: true, categoryId: true, createdAt: true,
      },
    })
    if (!business) return reply.code(403).send({ error: 'Yetkisiz.' })

    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const recentReviews = await prisma.review.findMany({
      where:   { businessId: id, createdAt: { gte: sixMonthsAgo } },
      select:  { rating: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })

    const monthlyMap = {}
    for (const r of recentReviews) {
      const key = r.createdAt.toISOString().slice(0, 7)
      if (!monthlyMap[key]) monthlyMap[key] = { count: 0, totalRating: 0 }
      monthlyMap[key].count++
      monthlyMap[key].totalRating += r.rating
    }
    const monthlyTrend = Object.entries(monthlyMap).map(([month, d]) => ({
      month,
      count:     d.count,
      avgRating: d.count > 0 ? Math.round((d.totalRating / d.count) * 10) / 10 : 0,
    }))

    const ratingDist = [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: recentReviews.filter((r) => r.rating === star).length,
    }))

    const competitors = await prisma.business.findMany({
      where: {
        city:       business.city,
        categoryId: business.categoryId,
        isDeleted:  false,
        id:         { not: id },
      },
      select: {
        name: true, slug: true, averageRating: true,
        totalReviews: true, totalViews: true,
        _count: { select: { externalReviews: true } },
      },
      orderBy: { averageRating: 'desc' },
      take: 5,
    })

    const rank = await prisma.business.count({
      where: {
        city:          business.city,
        categoryId:    business.categoryId,
        isDeleted:     false,
        averageRating: { gt: business.averageRating ?? 0 },
      },
    })

    const sentimentRows = await prisma.$queryRawUnsafe(
      `SELECT sentiment, COUNT(*) as count FROM "Review" WHERE "businessId" = $1 AND sentiment IS NOT NULL GROUP BY sentiment`,
      id,
    ).catch(() => [])

    const keywordRows = await prisma.$queryRawUnsafe(
      `SELECT unnest("sentimentKeywords") as keyword FROM "Review" WHERE "businessId" = $1 AND "sentimentKeywords" IS NOT NULL`,
      id,
    ).catch(() => [])

    const sentimentDist = { pozitif: 0, negatif: 0, notr: 0 }
    for (const row of sentimentRows) sentimentDist[row.sentiment] = parseInt(row.count)

    const keywordCount = {}
    for (const row of keywordRows) {
      const k = row.keyword?.toLowerCase()
      if (k) keywordCount[k] = (keywordCount[k] || 0) + 1
    }
    const topKeywords = Object.entries(keywordCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word, count]) => ({ word, count }))

    return reply.send({
      overview: {
        totalViews:    business.totalViews,
        totalReviews:  business.totalReviews,
        averageRating: business.averageRating,
        cityRank:      rank + 1,
      },
      monthlyTrend,
      ratingDistribution: ratingDist,
      competitors: [
        {
          name: business.name, slug: null,
          averageRating: business.averageRating,
          totalReviews:  business.totalReviews,
          totalViews:    business.totalViews,
          isSelf: true,
        },
        ...competitors.map((c) => ({ ...c, isSelf: false })),
      ],
      sentiment: { distribution: sentimentDist, topKeywords },
    })
  })
}

export default businessRoutes