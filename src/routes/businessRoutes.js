import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function awardPoints(userId, points, reason, refId = '') {
  try {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          currentPoints:     { increment: points },
          totalEarnedPoints: { increment: points },
        }
      }),
      prisma.marketPointLog.create({
        data: {
          userId,
          points,
          reason: reason.toUpperCase(),
          description: reason === 'business_added'
            ? `İşletme ekleme ödülü (+50 TP)${refId ? ' [' + refId + ']' : ''}`
            : reason,
        }
      })
    ])
  } catch (e) {
    console.error('awardPoints error:', e.message)
  }
}
import { generateSlug, generateUniqueSlug } from '../utils/slugify.js';


async function businessRoutes(fastify) {
  fastify.get('/count', async (request, reply) => {
    const total = await prisma.business.count({ where: { isDeleted: false } })
    return reply.send({ total })
  })


  // ─── GET / — İşletme Listesi ───────────────────────────────────────────────

  fastify.get('/', { preHandler: [fastify.optionalAuth] }, async (request, reply) => {
    const {
      page = 1, limit = 20,
      city, district, categoryId, categorySlug,
      sort = 'rating', // rating | newest | mostReviewed
      minRating, search, lat, lng, radiusKm = 30,
    } = request.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = Math.min(parseInt(limit), 50);

    const where = {
      isActive: true,
      isDeleted: false,
      ...(city       && { city:     { contains: city,     mode: 'insensitive' } }),
      ...(district   && { district: { contains: district, mode: 'insensitive' } }),
      ...(categoryId && { categoryId }),
      ...(categorySlug && { category: { slug: categorySlug } }),
      ...(minRating  && { averageRating: { gte: parseFloat(minRating) } }),
      ...(search     && {
        OR: [
          { name:        { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { district:    { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    // Konum filtresi
    if (lat && lng) {
      const userLat = parseFloat(lat)
      const userLng = parseFloat(lng)
      const km = parseFloat(radiusKm) || 30
      where.latitude  = { gte: userLat - (km / 111.0), lte: userLat + (km / 111.0) }
      where.longitude = { gte: userLng - (km / 85.0),  lte: userLng + (km / 85.0) }
    }

    const orderBy =
      sort === 'newest'      ? { createdAt: 'desc' } :
      sort === 'mostReviewed'? { totalReviews: 'desc' } :
                               { averageRating: 'desc' };

    const selectFields = { id: true, name: true, slug: true, description: true, address: true, city: true, district: true, latitude: true, longitude: true, averageRating: true, totalReviews: true, totalViews: true, claimStatus: true, isVerified: true, attributes: true, subscriptionPlan: true, category: { select: { id: true, name: true, slug: true, icon: true } }, owner: { select: { id: true, username: true, badgeLevel: true } }, _count: { select: { externalReviews: true } } }
    const boostedWhere = { ...where, subscriptionPlan: { in: ['PREMIUM', 'ENTERPRISE'] } }

    try {
      const [boosted, regular, total] = await Promise.all([
        prisma.business.findMany({ where: boostedWhere, orderBy, take: 5, select: selectFields }),
        prisma.business.findMany({ where: { ...where, subscriptionPlan: { notIn: ['PREMIUM', 'ENTERPRISE'] } }, orderBy, skip, take, select: selectFields }),
        prisma.business.count({ where }),
      ]);
      const boostedIds = new Set(boosted.map((b) => b.id))
      const businesses = [...boosted, ...regular.filter((b) => !boostedIds.has(b.id))]






      return reply.code(200).send({
        data: businesses,
        pagination: {
          page: parseInt(page), limit: take, total,
          totalPages: Math.ceil(total / take),
        },
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'İşletmeler alınamadı.' });
    }
  });

  // ─── GET /:slug — İşletme Detayı ──────────────────────────────────────────

  fastify.get('/:slug', { preHandler: [fastify.optionalAuth] }, async (request, reply) => {
    const { slug } = request.params;

    try {
      const business = await prisma.business.findFirst({
        where: { slug },
        include: {
          category: true,
          photos: { orderBy: { order: 'asc' }, take: 10 },
            badges: { where: { isActive: true }, select: { type: true, awardedAt: true } },
          owner: { select: { id: true, username: true, fullName: true, avatarUrl: true, badgeLevel: true } },
          reviews: {
            where: { isPublished: true },
            orderBy: { createdAt: 'desc' },
            take: 10,
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
          externalReviews: {
            where: { isVisible: true },
            orderBy: { publishedAt: 'desc' },
            take: 30,
          },
        },
      });

      if (!business || business.isDeleted) {
        return reply.code(404).send({ error: 'İşletme bulunamadı.' });
      }

      // Görüntülenme sayacı (async — cevabı bekletmez)
      prisma.business.update({
        where: { id: business.id },
        data: { totalViews: { increment: 1 } },
      }).catch(() => {});

      // Rating dağılımı
      const ratingDist = await prisma.review.groupBy({
        by: ['rating'],
        where: { businessId: business.id, isPublished: true },
        _count: { rating: true },
      });
      const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      ratingDist.forEach(r => { ratingDistribution[r.rating] = r._count.rating; });

      return reply.code(200).send({ ...business, ratingDistribution });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'İşletme alınamadı.' });
    }
  });

  // ─── POST / — İşletme Oluştur ─────────────────────────────────────────────

  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { name, address, city, district, categoryId, description, phoneNumber, email, website, attributes, isActive, isVerified } = request.body || {};

    if (!name || !address || !city || !categoryId) {
      return reply.code(400).send({ error: 'Ad, adres, şehir ve kategori zorunludur.' });
    }

    try {
      const baseSlug = generateSlug(name);
      const slug = await generateUniqueSlug(baseSlug, async (s) => {
        return !!(await prisma.business.findFirst({ where: { slug: s } }));
      });

      const business = await prisma.business.create({
        data: {
          name, slug, address, city, district, categoryId,
          description, phoneNumber, email, website,
          attributes: attributes || {},
          isActive: false,       // Admin onayına kadar pasif
          isVerified: false,     // Admin onayına kadar doğrulanmamış
          ownerId: request.user.userId, // Kimin eklediğini tut
        },
        include: { category: true },
      });

      // Puan onay sonrası verilecek — şimdi VERİLMİYOR

      return reply.code(201).send({ message: 'İşletmeniz incelemeye alındı. Onaylandıktan sonra yayınlanacak.', business });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'İşletme oluşturulamadı.' });
    }
  });


  // ─── GET /pending — Admin: Onay Bekleyen İşletmeler ──────────────────────
  fastify.get('/pending', { preHandler: [fastify.optionalAuth] }, async (request, reply) => {
    const { secret } = request.query;
    if (secret !== 'tecrube_admin_2026') return reply.code(403).send({ error: 'Yetkisiz' });
    try {
      const businesses = await prisma.business.findMany({
        where: { isVerified: false, isDeleted: false, ownerId: { not: null } },
        orderBy: { createdAt: 'desc' },
        include: { category: true, owner: { select: { id: true, username: true, fullName: true } } },
        take: 50,
      });
      return reply.code(200).send({ businesses });
    } catch (err) {
      return reply.code(500).send({ error: 'Hata' });
    }
  });

  // ─── POST /:id/approve — Admin: İşletme Onayla ───────────────────────────
  fastify.post('/:id/approve', { preHandler: [fastify.optionalAuth] }, async (request, reply) => {
    const { secret } = request.body || {};
    if (secret !== 'tecrube_admin_2026') return reply.code(403).send({ error: 'Yetkisiz' });
    try {
      const business = await prisma.business.update({
        where: { id: request.params.id },
        data: { isActive: true, isVerified: true },
        select: { id: true, name: true, ownerId: true },
      });

      // Onay sonrası +50 TP ver (ownerId varsa ve daha önce verilmemişse)
      if (business.ownerId) {
        const alreadyAwarded = await prisma.marketPointLog.findFirst({
          where: { userId: business.ownerId, reason: 'BUSINESS_ADDED',
                   description: { contains: business.id } }
        }).catch(() => null)

        if (!alreadyAwarded) {
          await awardPoints(business.ownerId, 50, 'business_added', business.id).catch(() => {})
        }
      }

      return reply.code(200).send({ message: 'Onaylandı', business });
    } catch (err) {
      return reply.code(500).send({ error: 'Hata' });
    }
  });

  // ─── POST /:id/reject — Admin: İşletme Reddet ────────────────────────────
  fastify.post('/:id/reject', { preHandler: [fastify.optionalAuth] }, async (request, reply) => {
    const { secret } = request.body || {};
    if (secret !== 'tecrube_admin_2026') return reply.code(403).send({ error: 'Yetkisiz' });
    try {
      await prisma.business.update({
        where: { id: request.params.id },
        data: { isDeleted: true, isActive: false },
      });
      return reply.code(200).send({ message: 'Reddedildi' });
    } catch (err) {
      return reply.code(500).send({ error: 'Hata' });
    }
  });

  // ─── PUT /:slug — İşletme Güncelle ────────────────────────────────────────

  fastify.put('/:slug', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { slug } = request.params;
    const { name, address, city, district, description, phoneNumber, email, website, attributes } = request.body || {};

    try {
      const business = await prisma.business.findFirst({ where: { slug } });
      if (!business) return reply.code(404).send({ error: 'İşletme bulunamadı.' });
      if (business.ownerId !== request.user.userId) {
        return reply.code(403).send({ error: 'Bu işletmeyi güncelleme yetkiniz yok.' });
      }

      const updated = await prisma.business.update({
        where: { slug },
        data: { name, address, city, district, description, phoneNumber, email, website, attributes },
        include: { category: true },
      });

      return reply.code(200).send({ message: 'İşletme güncellendi.', business: updated });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'İşletme güncellenemedi.' });
    }
  });

  // ─── DELETE /:slug — İşletme Sil (soft) ───────────────────────────────────

  fastify.delete('/:slug', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { slug } = request.params;

    try {
      const business = await prisma.business.findFirst({ where: { slug } });
      if (!business) return reply.code(404).send({ error: 'İşletme bulunamadı.' });
      if (business.ownerId !== request.user.userId) {
        return reply.code(403).send({ error: 'Bu işletmeyi silme yetkiniz yok.' });
      }

      await prisma.business.update({
        where: { slug },
        data: { isDeleted: true, isActive: false },
      });

      return reply.code(200).send({ message: 'İşletme silindi.' });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'İşletme silinemedi.' });
    }
  });

  // ─── POST /:id/claim — Sahiplik Talebi ────────────────────────────────────

  fastify.post('/:id/claim', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params;
    const { documents = [], notes } = request.body || {};

    try {
      const business = await prisma.business.findFirst({ where: { id } });
      if (!business) return reply.code(404).send({ error: 'İşletme bulunamadı.' });
      if (business.claimStatus === 'CLAIMED') {
        return reply.code(409).send({ error: 'Bu işletme zaten sahiplenilmiş.' });
      }

      const pending = await prisma.businessClaimHistory.findFirst({
        where: { businessId: id, userId: request.user.userId, status: 'PENDING' },
      });
      if (pending) return reply.code(409).send({ error: 'Zaten bekleyen bir talebiniz var.' });

      await prisma.$transaction([
        prisma.businessClaimHistory.create({
          data: { businessId: id, userId: request.user.userId, status: 'PENDING', documents, notes },
        }),
        prisma.business.update({ where: { id }, data: { claimStatus: 'PENDING' } }),
      ]);

      return reply.code(201).send({ message: 'Sahiplik talebiniz alındı. İncelendikten sonra bildirim alacaksınız.' });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Talep gönderilemedi.' });
    }
  });

  // ─── GET /:id/reviews — Sayfalı Yorumlar ──────────────────────────────────

  fastify.get('/:id/reviews', { preHandler: [fastify.optionalAuth] }, async (request, reply) => {
    const { id } = request.params;
    const { page = 1, limit = 10, sort = 'newest', rating } = request.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = Math.min(parseInt(limit), 50);

    const orderBy =
      sort === 'helpful'     ? { helpfulCount: 'desc' } :
      sort === 'rating_high' ? { rating: 'desc' } :
      sort === 'rating_low'  ? { rating: 'asc' } :
                               { createdAt: 'desc' };

    try {
      const where = {
        businessId: id, isPublished: true, isFlagged: false,
        ...(rating && { rating: parseInt(rating) }),
      };

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
      ]);

      return reply.code(200).send({
        data: reviews,
        pagination: { page: parseInt(page), limit: take, total, totalPages: Math.ceil(total / take) },
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Yorumlar alınamadı.' });
    }
  });


  // --- POST/DELETE /:id/save -- Kaydet / Kaldir ---

  fastify.post('/:id/save', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params;
    try {
      const business = await prisma.business.findFirst({ where: { id }, select: { id: true } });
      if (!business) return reply.code(404).send({ error: 'Isletme bulunamadi.' });

      const existing = await prisma.savedBusiness.findUnique({
        where: { userId_businessId: { userId: request.user.userId, businessId: id } },
      });
      if (existing) return reply.code(400).send({ error: 'Zaten kaydedilmis.' });

      await prisma.savedBusiness.create({
        data: { userId: request.user.userId, businessId: id },
      });
      return reply.code(201).send({ saved: true });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Kaydetme islemi basarisiz.' });
    }
  });

  fastify.delete('/:id/save', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params;
    try {
      await prisma.savedBusiness.deleteMany({
        where: { userId: request.user.userId, businessId: id },
      });
      return reply.code(200).send({ saved: false });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Kayit silme basarisiz.' });
    }
  });
  // GET /api/businesses/:id/analytics — Sahip paneli analitik
  fastify.get('/:id/analytics', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params
    const userId = request.user.id

    // Sahip kontrolu
    const business = await prisma.business.findFirst({
      where: { id, ownerId: userId, isDeleted: false },
      select: { id: true, name: true, totalViews: true, totalReviews: true, averageRating: true, city: true, district: true, categoryId: true, createdAt: true }
    })
    if (!business) return reply.code(403).send({ error: 'Yetkisiz.' })

    // Son 6 ay yorum trendi
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const recentReviews = await prisma.review.findMany({
      where: { businessId: id, createdAt: { gte: sixMonthsAgo } },
      select: { rating: true, createdAt: true },
      orderBy: { createdAt: 'asc' }
    })

    // Aylik gruplama
    const monthlyMap = {}
    for (const r of recentReviews) {
      const key = r.createdAt.toISOString().slice(0, 7) // YYYY-MM
      if (!monthlyMap[key]) monthlyMap[key] = { count: 0, totalRating: 0 }
      monthlyMap[key].count++
      monthlyMap[key].totalRating += r.rating
    }
    const monthlyTrend = Object.entries(monthlyMap).map(([month, d]) => ({
      month,
      count: d.count,
      avgRating: d.count > 0 ? Math.round((d.totalRating / d.count) * 10) / 10 : 0
    }))

    // Puan dagilimi
    const ratingDist = [5, 4, 3, 2, 1].map(star => ({
      star,
      count: recentReviews.filter(r => r.rating === star).length
    }))

    // Rakip karsilastirma — ayni sehir/kategori
    const competitors = await prisma.business.findMany({
      where: {
        city: business.city,
        categoryId: business.categoryId,
        isDeleted: false,
        id: { not: id }
      },
      select: { name: true, slug: true, averageRating: true, totalReviews: true, totalViews: true, _count: { select: { externalReviews: true } } },
      orderBy: { averageRating: 'desc' },
      take: 5
    })

    // Kendi siralama
    const rank = await prisma.business.count({
      where: {
        city: business.city,
        categoryId: business.categoryId,
        isDeleted: false,
        averageRating: { gt: business.averageRating ?? 0 }
      }
    })
    const sentimentRows = await prisma.$queryRawUnsafe(
      `SELECT sentiment, COUNT(*) as count FROM "Review" WHERE "businessId" = $1 AND sentiment IS NOT NULL GROUP BY sentiment`,
      id
    ).catch(() => [])
    const keywordRows = await prisma.$queryRawUnsafe(
      `SELECT unnest("sentimentKeywords") as keyword FROM "Review" WHERE "businessId" = $1 AND "sentimentKeywords" IS NOT NULL`,
      id
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
        totalViews: business.totalViews,
        totalReviews: business.totalReviews,
        averageRating: business.averageRating,
        cityRank: rank + 1,
      },
      monthlyTrend,
      ratingDistribution: ratingDist,
      competitors: [
        { name: business.name, slug: null, averageRating: business.averageRating, totalReviews: business.totalReviews, totalViews: business.totalViews, isSelf: true },
        ...competitors.map(c => ({ ...c, isSelf: false }))
      ],
      sentiment: { distribution: sentimentDist, topKeywords }
    })
  })

}
export default businessRoutes
