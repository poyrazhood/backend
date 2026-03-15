import prisma from '../lib/prisma.js'
﻿;
import { fixTurkish } from '../utils/fixTurkish.js'
import http from 'http';

;

async function getEmbedding(text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: 'bge-m3', prompt: text })
    const req = http.request(
      { hostname: 'localhost', port: 11434, path: '/api/embeddings', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let data = ''
        res.on('data', c => data += c)
        res.on('end', () => {
          try { resolve(JSON.parse(data).embedding) }
          catch (e) { reject(new Error('Embedding parse hatasi')) }
        })
      }
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

async function searchRoutes(fastify) {

  // GET / — Ana Arama (Hibrit: vektör + trgm)
  fastify.get('/', { preHandler: [fastify.optionalAuth] }, async (request, reply) => {
    const {
      q, type = 'all',
      city, categorySlug, minRating,
      sort = 'relevance',
      page = 1, limit = 20,
      userLat, userLng, radiusKm = 30,
    } = request.query;

    if (!q || q.trim().length < 2) {
      return reply.code(200).send({ query: q, businesses: [], users: [], total: 0 });
    }

    const query = q.trim();
    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const take  = Math.min(parseInt(limit), 50);
    const results = { query };

    // Konum parametreleri
    const hasLocation = userLat && userLng
    const lat1 = hasLocation ? parseFloat(userLat) : null
    const lng1 = hasLocation ? parseFloat(userLng) : null
    const radius = parseFloat(radiusKm) || 30

    try {
      // Isletme araması — hibrit
      if (type === 'all' || type === 'business') {
        let businesses = []
        try {
          const embedding = await getEmbedding(query)
          const vectorStr = `[${embedding.join(',')}]`
          // Konum varsa daha fazla çek, sonra filtrele
          const fetchLimit = hasLocation ? Math.min(take * 10, 500) : take
          const rawBusinesses = await prisma.$queryRawUnsafe(`
            SELECT
              id, name, slug, city, district, category_name,
              average_rating, total_reviews, latitude, longitude,
              vec_score, trgm_score, final_score
            FROM search_businesses(
              $1::text, $2::vector(1024), $3::text, $4::text, $5::int, 0.6::float, 0.4::float
            )
          `, query, vectorStr, city || null, categorySlug || null, fetchLimit)

          // Photos ekle
          const bizIds = rawBusinesses.map(b => b.id)
          const photoMap = {}
          if (bizIds.length > 0) {
            const rows = await prisma.$queryRawUnsafe(
              'SELECT id, attributes->>\'coverPhoto\' as cover_photo FROM "Business" WHERE id = ANY($1) AND attributes->>\'coverPhoto\' IS NOT NULL',
              bizIds
            )
            rows.forEach(r => {
              if (r.cover_photo) photoMap[r.id] = r.cover_photo
            })
          }

          businesses = rawBusinesses.map(b => {
            const vec = Number(b.vec_score)
            const trgm = Number(b.trgm_score)
            const boost = Number(b.category_boost || 0)
            let reason = ''
            if (boost > 0 && vec > 0.6) reason = 'Kategori ve icerik eslesmesi guclu'
            else if (vec > 0.65) reason = 'Aramanizla yuksek semantik benzerlik'
            else if (trgm > 0.4) reason = 'Isim aramanizla dogrudan eslesiyor'
            else if (vec > 0.58) reason = 'Aramanizla ilgili icerik bulundu'
            else reason = 'Aramanizla kismi eslesme'

            // Mesafe hesapla
            let distanceKm = null
            if (hasLocation && b.latitude && b.longitude) {
              distanceKm = Math.round(haversineKm(lat1, lng1, Number(b.latitude), Number(b.longitude)) * 10) / 10
            }

            return { ...b, reason, distanceKm, photos: photoMap[b.id] ? [{ url: photoMap[b.id] }] : [] }
          })

          // Mesafe filtresi
          if (hasLocation) {
            businesses = businesses.filter(b => {
              if (b.distanceKm === null) return true // koordinat yoksa goster
              return b.distanceKm <= radius
            })
            // Mesafe + skor karma sıralama
            businesses.sort((a, b) => {
              const aScore = (a.final_score || 0) - (a.distanceKm || 0) * 0.005
              const bScore = (b.final_score || 0) - (b.distanceKm || 0) * 0.005
              return bScore - aScore
            })
            businesses = businesses.slice(0, take)
          }

          // minRating filtresi
          if (minRating) {
            businesses = businesses.filter(b => Number(b.average_rating) >= parseFloat(minRating))
          }

        } catch (e) {
          console.error('VEKTOR HATA DETAY:', e.message, e.stack)
          businesses = await prisma.business.findMany({
            where: {
              isActive: true, isDeleted: false,
              OR: [
                { name:     { contains: query, mode: 'insensitive' } },
                { district: { contains: query, mode: 'insensitive' } },
                { category: { name: { contains: query, mode: 'insensitive' } } },
              ],
              ...(city      && { city: { contains: city, mode: 'insensitive' } }),
              ...(minRating && { averageRating: { gte: parseFloat(minRating) } }),
            },
            orderBy: { totalViews: 'desc' },
            skip, take,
            select: {
              id: true, name: true, slug: true, city: true, district: true,
              averageRating: true, totalReviews: true,
            },
          })
        }

        results.businesses    = businesses
        results.businessTotal = businesses.length
      }

      // Kullanıcı araması
      if (type === 'all' || type === 'user') {
        const where = {
          isActive: true, isBanned: false,
          OR: [
            { username: { contains: query, mode: 'insensitive' } },
            { fullName: { contains: query, mode: 'insensitive' } },
          ],
        }
        const [users, userTotal] = await Promise.all([
          prisma.user.findMany({
            where, skip, take: Math.min(take, 10),
            orderBy: { trustScore: 'desc' },
            select: {
              id: true, username: true, fullName: true, avatarUrl: true,
              trustScore: true, trustLevel: true, badgeLevel: true, totalReviews: true,
            },
          }),
          prisma.user.count({ where }),
        ])
        results.users     = users
        results.userTotal = userTotal
      }

      // Yorum araması
      if (type === 'review') {
        const where = {
          isPublished: true, isFlagged: false,
          OR: [
            { content: { contains: query, mode: 'insensitive' } },
            { title:   { contains: query, mode: 'insensitive' } },
          ],
        }
        const [reviews, reviewTotal] = await Promise.all([
          prisma.review.findMany({
            where, skip, take,
            orderBy: { helpfulCount: 'desc' },
            include: {
              user:     { select: { id: true, username: true, fullName: true, avatarUrl: true } },
              business: { select: { id: true, name: true, slug: true } },
            },
          }),
          prisma.review.count({ where }),
        ])
        results.reviews     = reviews
        results.reviewTotal = reviewTotal
      }

      // Son aramayı Redis'e kaydet
      if (fastify.redis?.isOpen && request.user) {
        const key = `recent_searches:${request.user.userId}`
        fastify.redis.lPush(key, query).catch(() => {})
        fastify.redis.lTrim(key, 0, 9).catch(() => {})
        fastify.redis.expire(key, 60 * 60 * 24 * 7).catch(() => {})
      }

      return reply.code(200).send({
        ...results,
        pagination: { page: parseInt(page), limit: take },
      })
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: 'Arama basarisiz.' })
    }
  })

  // GET /suggestions — Otomatik Tamamlama
  fastify.get('/suggestions', async (request, reply) => {
    const { q } = request.query
    if (!q || q.length < 2) return reply.code(200).send({ suggestions: [] })
    try {
      const businesses = await prisma.business.findMany({
        where: {
          isActive: true, isDeleted: false,
          name: { startsWith: q, mode: 'insensitive' },
        },
        select: { id: true, name: true, slug: true, city: true },
        take: 6,
        orderBy: { totalViews: 'desc' },
      })
      return reply.code(200).send({
        suggestions: businesses.map(b => ({
          type: 'business', id: b.id, label: b.name,
          sublabel: b.city, href: `/isletme/${b.slug}`,
        })),
      })
    } catch (err) {
      return reply.code(500).send({ error: 'Oneri alinamadi.' })
    }
  })

  // GET /trending — Trend Kategoriler
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
      return reply.code(500).send({ error: 'Trend verisi alinamadi.' })
    }
  })
}

export default searchRoutes
