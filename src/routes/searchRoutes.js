import prisma from '../lib/prisma.js'

// ─── Niyet Analizi ────────────────────────────────────────────────────────────
// Kullanıcının arama sorgusundan kategori, özellik ve niyet çıkarır

const INTENT_MAP = [
  // Kategori eşleşmeleri
  { pattern: /kafe|kahve|espresso|cappuccino/i,      category: 'kafe',           label: 'Kafe' },
  { pattern: /restoran|yemek|lokanta|döner|kebap/i,  category: 'restoran',       label: 'Restoran' },
  { pattern: /oto|araba|servis|tamir|lastik/i,       category: 'oto-servis',     label: 'Oto Servis' },
  { pattern: /kuaför|berber|saç|tıraş/i,             category: 'kuafor-berber',  label: 'Kuaför & Berber' },
  { pattern: /güzellik|cilt|makyaj|spa|masaj/i,      category: 'guzellik-bakim', label: 'Güzellik' },
  { pattern: /doktor|hastane|klinik|sağlık/i,        category: 'saglik',         label: 'Sağlık' },
  { pattern: /okul|kurs|dershane|eğitim/i,           category: 'egitim',         label: 'Eğitim' },
  { pattern: /otel|pansiyon|konaklama/i,             category: 'otel',           label: 'Otel' },
  { pattern: /market|süpermarket|bakkal/i,           category: 'market',         label: 'Market' },
  { pattern: /avukat|hukuk|noter/i,                  category: 'hukuk',          label: 'Hukuk' },
  { pattern: /spor|fitness|gym|yüzme/i,              category: 'spor-fitness',   label: 'Spor' },
  { pattern: /pastane|fırın|pasta|börek/i,           category: 'pastane-firin',  label: 'Pastane' },
  { pattern: /eczane|ilaç/i,                         category: 'eczane',         label: 'Eczane' },
  { pattern: /veteriner|evcil|köpek|kedi/i,          category: 'veteriner',      label: 'Veteriner' },
]

const QUALITY_SIGNALS = [
  { pattern: /ucuz|ekonomik|uygun fiyat|hesaplı/i,   signal: 'budget',     reason: 'Uygun fiyatlı seçenekler' },
  { pattern: /kaliteli|iyi|güzel|harika|mükemmel/i,  signal: 'quality',    reason: 'Yüksek kaliteli işletmeler' },
  { pattern: /hızlı|çabuk|express/i,                 signal: 'fast',       reason: 'Hızlı hizmet verenler' },
  { pattern: /sakin|sessiz|huzurlu|rahat/i,          signal: 'calm',       reason: 'Sakin ve huzurlu ortam' },
  { pattern: /çalışma|laptop|wifi|internet/i,        signal: 'work',       reason: 'Çalışma dostu mekanlar' },
  { pattern: /aile|çocuk|bebek/i,                    signal: 'family',     reason: 'Aile dostu mekanlar' },
  { pattern: /açık|teras|bahçe/i,                    signal: 'outdoor',    reason: 'Açık alan seçenekleri' },
  { pattern: /gece|bar|eğlence/i,                    signal: 'nightlife',  reason: 'Gece hayatı mekanları' },
  { pattern: /öğrenci|üniversite/i,                  signal: 'student',    reason: 'Öğrenci dostu mekanlar' },
  { pattern: /güvenilir|güvenli|şeffaf/i,            signal: 'trust',      reason: 'Güvenilir ve şeffaf işletmeler' },
  { pattern: /en iyi|en çok|popüler|trend/i,         signal: 'popular',    reason: 'En popüler işletmeler' },
]

function analyzeIntent(q) {
  const detectedCategory = INTENT_MAP.find(m => m.pattern.test(q))
  const detectedSignals = QUALITY_SIGNALS.filter(s => s.pattern.test(q))
  const cleanQuery = q
    .replace(/en iyi|en çok|popüler|yakın|bana|lütfen|acaba/gi, '')
    .trim()

  return {
    categorySlug: detectedCategory?.category || null,
    categoryLabel: detectedCategory?.label || null,
    signals: detectedSignals,
    cleanQuery,
    isQualitySearch: detectedSignals.some(s => ['quality', 'trust', 'popular'].includes(s.signal)),
    isBudgetSearch: detectedSignals.some(s => s.signal === 'budget'),
    isWorkSearch: detectedSignals.some(s => s.signal === 'work'),
    isCalmSearch: detectedSignals.some(s => s.signal === 'calm'),
  }
}

function buildReason(b, intent, trgmScore) {
  const parts = []

  if (intent.signals.length > 0) {
    parts.push(intent.signals[0].reason)
  } else if (trgmScore > 0.5) {
    parts.push('İsim aramanızla doğrudan eşleşiyor')
  } else if (trgmScore > 0.3) {
    parts.push('Aramanızla ilgili içerik bulundu')
  } else if (intent.categoryLabel) {
    parts.push(`${intent.categoryLabel} kategorisinde`)
  }

  if (b.totalReviews > 100) parts.push(`${b.totalReviews} yorum`)
  else if (b.averageRating >= 4.5) parts.push('yüksek puan')

  return parts.join(' · ') || 'Aramanızla eşleşiyor'
}

async function searchRoutes(fastify) {

  // ─── GET / — Ana Arama ────────────────────────────────────────────────────
  fastify.get('/', { preHandler: [fastify.optionalAuth] }, async (request, reply) => {
    const {
      q, type = 'all',
      city, categorySlug, minRating,
      sort = 'relevance',
      page = 1, limit = 20,
      userLat, userLng,
    } = request.query

    if (!q || q.trim().length < 2) {
      return reply.code(200).send({ query: q, businesses: [], users: [], reviews: [], total: 0 })
    }

    const query = q.trim()
    const skip  = (parseInt(page) - 1) * parseInt(limit)
    const take  = Math.min(parseInt(limit), 50)
    const results = { query }

    // Niyet analizi
    const intent = analyzeIntent(query)

    // Efektif kategori: URL parametresi > niyet analizi
    const effectiveCategorySlug = categorySlug || intent.categorySlug

    try {
      // ── İşletme araması ──────────────────────────────────────────────────
      if (type === 'all' || type === 'business') {
        // Sıralama
        const orderByClause =
          sort === 'newest'    ? 'b."createdAt" DESC' :
          sort === 'reviews'   ? 'b."totalReviews" DESC' :
          sort === 'trust'     ? 'b."trustScore" DESC' :
          // relevance: trust score + review count karma
          'b."totalReviews" DESC, b."averageRating" DESC'

        // Ek filtreler
        const extraWhere = []
        const params = [`%${query}%`, take, skip]
        let pIdx = 4

        if (city) {
          extraWhere.push(`AND b.city ILIKE $${pIdx}`)
          params.push(`%${city}%`)
          pIdx++
        }
        if (effectiveCategorySlug) {
          extraWhere.push(`AND c.slug ILIKE $${pIdx}`)
          params.push(`%${effectiveCategorySlug}%`)
          pIdx++
        }
        if (minRating) {
          extraWhere.push(`AND b."averageRating" >= $${pIdx}`)
          params.push(parseFloat(minRating))
          pIdx++
        }

        // Quality signal'lara göre ek filtreler
        if (intent.isQualitySearch) {
          extraWhere.push(`AND b."averageRating" >= 4.0`)
        }
        if (intent.isBudgetSearch) {
          // Budget aramasında çok yorumlu (popüler = rekabetçi fiyat) işletmeleri öne çıkar
          // orderBy override: totalReviews
        }

        const rawRows = await prisma.$queryRawUnsafe(
          `SELECT
             b.id, b.name, b.slug, b.city, b.district,
             b."averageRating", b."totalReviews", b."claimStatus",
             b."isVerified", b."verificationLevel", b."subscriptionPlan",
             b."trustScore", b."trustGrade",
             c.id as cat_id, c.name as cat_name, c.slug as cat_slug, c.icon as cat_icon,
             (SELECT p.url FROM "BusinessPhoto" p
              WHERE p."businessId" = b.id ORDER BY p."order" ASC LIMIT 1) as photo_url,
             similarity(b.name, $1) as trgm_score
           FROM "Business" b
           LEFT JOIN "Category" c ON c.id = b."categoryId"
           WHERE b."isActive" = true AND b."isDeleted" = false
             AND (
               b.name ILIKE $1
               OR b.district ILIKE $1
               ${effectiveCategorySlug ? '' : 'OR c.name ILIKE $1'}
             )
             ${extraWhere.join(' ')}
           ORDER BY ${orderByClause}
           LIMIT $2 OFFSET $3`,
          ...params
        )

        const businesses = rawRows.map(row => ({
          id: row.id, name: row.name, slug: row.slug,
          city: row.city, district: row.district,
          averageRating: row.averageRating,
          totalReviews: row.totalReviews,
          claimStatus: row.claimStatus,
          isVerified: row.isVerified,
          verificationLevel: row.verificationLevel,
          subscriptionPlan: row.subscriptionPlan,
          trustScore: row.trustScore,
          trustGrade: row.trustGrade,
          photos: row.photo_url ? [{ url: row.photo_url }] : [],
          badges: [],
          category: row.cat_id
            ? { id: row.cat_id, name: row.cat_name, slug: row.cat_slug, icon: row.cat_icon }
            : null,
          reason: buildReason(row, intent, Number(row.trgm_score || 0)),
          vec_score: null,
          trgm_score: Number(row.trgm_score || 0),
          final_score: Number(row.averageRating || 0),
        }))

        results.businesses    = businesses
        results.businessTotal = businesses.length
        results.intent        = {
          detectedCategory: intent.categoryLabel,
          signals: intent.signals.map(s => s.reason),
          cleanQuery: intent.cleanQuery,
        }
      }

      // ── Kullanıcı araması ─────────────────────────────────────────────────
      if (type === 'all' || type === 'user') {
        const userWhere = {
          isActive: true, isBanned: false,
          OR: [
            { username: { contains: query, mode: 'insensitive' } },
            { fullName: { contains: query, mode: 'insensitive' } },
          ],
        }
        const [users, userTotal] = await Promise.all([
          prisma.user.findMany({
            where: userWhere,
            skip, take: Math.min(take, 10),
            orderBy: { trustScore: 'desc' },
            select: {
              id: true, username: true, fullName: true, avatarUrl: true,
              trustScore: true, trustLevel: true, badgeLevel: true, totalReviews: true,
            },
          }),
          prisma.user.count({ where: userWhere }),
        ])
        results.users     = users
        results.userTotal = userTotal
      }

      // ── Yorum araması ─────────────────────────────────────────────────────
      if (type === 'review') {
        const reviewWhere = {
          isPublished: true, isFlagged: false,
          OR: [
            { content: { contains: query, mode: 'insensitive' } },
            { title:   { contains: query, mode: 'insensitive' } },
          ],
        }
        const [reviews, reviewTotal] = await Promise.all([
          prisma.review.findMany({
            where: reviewWhere, skip, take,
            orderBy: { helpfulCount: 'desc' },
            include: {
              user:     { select: { id: true, username: true, fullName: true, avatarUrl: true } },
              business: { select: { id: true, name: true, slug: true } },
            },
          }),
          prisma.review.count({ where: reviewWhere }),
        ])
        results.reviews     = reviews
        results.reviewTotal = reviewTotal
      }

      return reply.code(200).send({
        ...results,
        pagination: { page: parseInt(page), limit: take },
      })
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: 'Arama başarısız.' })
    }
  })

  // ─── GET /suggestions — Otomatik Tamamlama ────────────────────────────────
  fastify.get('/suggestions', async (request, reply) => {
    const { q } = request.query
    if (!q || q.length < 2) return reply.code(200).send({ suggestions: [] })
    try {
      const businesses = await prisma.business.findMany({
        where: {
          isActive: true, isDeleted: false,
          name: { startsWith: q, mode: 'insensitive' },
        },
        select: { id: true, name: true, slug: true, city: true, category: { select: { name: true, icon: true } } },
        take: 6,
        orderBy: { totalReviews: 'desc' },
      })
      return reply.code(200).send({
        suggestions: businesses.map(b => ({
          type: 'business', id: b.id, label: b.name,
          sublabel: `${b.category?.name || ''} · ${b.city}`,
          icon: b.category?.icon || '🏢',
          href: `/isletme/${b.slug}`,
        })),
      })
    } catch (err) {
      return reply.code(500).send({ error: 'Öneri alınamadı.' })
    }
  })

  // ─── GET /trending — Trend Kategoriler ───────────────────────────────────
  fastify.get('/trending', async (request, reply) => {
    try {
      const trending = await prisma.category.findMany({
        where: { businesses: { some: { isActive: true } } },
        select: {
          id: true, name: true, slug: true, icon: true,
          _count: { select: { businesses: true } },
        },
        orderBy: { businesses: { _count: 'desc' } },
        take: 8,
      })
      return reply.code(200).send({ trending })
    } catch (err) {
      return reply.code(500).send({ error: 'Trend verisi alınamadı.' })
    }
  })
}

export default searchRoutes
