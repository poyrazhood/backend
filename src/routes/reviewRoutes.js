import { PrismaClient } from '@prisma/client';
import { fixTurkish } from '../utils/fixTurkish.js'
import { notifyNewReview, notifyOwnerReply } from '../services/notificationService.js'
import { updateTrustScore, calculateBadgeLevel } from '../services/userService.js';
import { recalculateTrustLevel } from '../services/trustService.js'
import { recalculateUserVector } from '../services/userVectorService.js'
import { analyzeSentiment } from '../services/sentimentService.js'

const prisma = new PrismaClient();

// ─── Puan Kazanma Helper ──────────────────────────────────────────────────────
const REASON_LABELS = {
  review_written:  'Yorum yazma ödülü (+20 TP)',
  helpful_vote:    'Faydalı oy ödülü (+5 TP)',
  photo_upload:    'Fotoğraf yükleme ödülü (+5 TP)',
  business_added:  'İşletme ekleme ödülü (+50 TP)',
}

async function awardPoints(userId, points, reason) {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Günlük limitler
    if (reason === 'review_written') {
      const todayCount = await prisma.marketPointLog.count({
        where: { userId, reason: 'REVIEW_WRITTEN', createdAt: { gte: today } }
      })
      if (todayCount >= 3) return  // Günde max 3 yorumdan puan
    }

    if (reason === 'helpful_vote') {
      const todayCount = await prisma.marketPointLog.count({
        where: { userId, reason: 'HELPFUL_VOTE', createdAt: { gte: today } }
      })
      if (todayCount >= 10) return  // Günde max 10 faydalı oy puanı
    }

    const reasonKey = reason.toUpperCase()

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
          reason: reasonKey,
          description: REASON_LABELS[reason] ?? reason,
        }
      })
    ])
  } catch (e) {
    console.error('awardPoints error:', e.message)
  }
}

// â”€â”€â”€ Fraud Detection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function detectFraud(content, rating, userTrustScore) {
  let score = 0;
  const factors = [];

  if (content.length < 20 && (rating === 1 || rating === 5)) {
    score += 20; factors.push('short_extreme_rating');
  }
  if (content === content.toUpperCase() && content.length > 10) {
    score += 15; factors.push('all_caps');
  }
  if ((content.match(/[!?]{2,}/g) || []).length > 3) {
    score += 10; factors.push('excessive_punctuation');
  }
  if (userTrustScore < 30) {
    score += 25; factors.push('low_trust_user');
  }
  const genericPhrases = ['best ever', 'worst ever', 'highly recommend', 'never go back'];
  if (genericPhrases.some(p => content.toLowerCase().includes(p)) && content.length < 50) {
    score += 15; factors.push('generic_template');
  }

  score = Math.min(score, 100);
  return {
    fraud_score: score,
    detection_method: 'rule_based',
    risk_factors: factors,
    automated_action: score > 60 ? 'quarantine' : score > 30 ? 'flag' : 'publish',
  };
}

// â”€â”€â”€ Routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function reviewRoutes(fastify) {

  // â”€â”€â”€ GET / â€” Platform Yorumları (sayfalı) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  fastify.get('/', { preHandler: [fastify.optionalAuth] }, async (request, reply) => {
    const { page = 1, limit = 20, sort = 'newest', businessId, userId } = request.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = Math.min(parseInt(limit), 50);

    const orderBy =
      sort === 'helpful' ? { helpfulCount: 'desc' } :
      sort === 'rating'  ? { rating: 'desc' } :
                           { createdAt: 'desc' };

    try {
      const where = {
        isPublished: true,
        ...(businessId && { businessId }),
        ...(userId     && { userId }),
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
            business: { select: { id: true, name: true, slug: true } },
            photos: true,
          },
        }),
        prisma.review.count({ where }),
      ]);

      return reply.code(200).send({
        reviews,
        pagination: {
          page: parseInt(page), limit: take,
          total, totalPages: Math.ceil(total / take),
        },
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Yorumlar alınamadı.' });
    }
  });

  // ─── GET /feed — Akıllı Feed ────────────────────────────────────────────────
  fastify.get('/feed', { preHandler: [fastify.optionalAuth] }, async (request, reply) => {
    const { page = 1, limit = 20, lat, lng, city } = request.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = Math.min(parseInt(limit), 50);
    const userLat = lat ? parseFloat(lat) : null;
    const userLng = lng ? parseFloat(lng) : null;

    // Haversine mesafe (km)
    function haversine(lat1, lng1, lat2, lng2) {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    // Ağırlıklı feed skoru
    function feedScore(review, bizLat, bizLng) {
      const now = Date.now();
      const date = new Date(review.publishedAt ?? review.scrapedAt ?? review.createdAt ?? now);
      const ageHours = (now - date.getTime()) / 3600000;
      const recency = Math.max(0, 1 - Math.log10(Math.max(1, ageHours) / 24) * 0.4);
      const photoBonus = (review.photos?.length > 0 || review.authorPhoto) ? 0.05 : 0;
      const trustBonus = review.user?.trustLevel === 'MUHTAR' ? 0.15
        : review.user?.trustLevel === 'VERIFIED' ? 0.10
        : review.user?.trustLevel === 'HIGHLY_TRUSTED' ? 0.07
        : review.user?.trustLevel === 'TRUSTED' ? 0.04 : 0;
      let locationScore = 0;
      let distanceKm = null;
      if (userLat && userLng && bizLat && bizLng) {
        distanceKm = haversine(userLat, userLng, bizLat, bizLng);
        locationScore = distanceKm <= 1 ? 0.30
          : distanceKm <= 5 ? 0.20
          : distanceKm <= 15 ? 0.10
          : distanceKm <= 30 ? 0.05 : 0;
      }
      const ratingBonus = (review.rating >= 4.5) ? 0.05 : (review.rating >= 4) ? 0.02 : 0;
      const score = recency * 0.5 + locationScore + photoBonus + trustBonus + ratingBonus;
      const reasons = [];
      if (distanceKm !== null && locationScore > 0) {
        reasons.push(distanceKm < 1 ? '1km yakınınızda' : `${Math.round(distanceKm * 10) / 10}km yakınınızda`);
      }
      if (ageHours <= 24) reasons.push('Son 24 saat');
      else if (ageHours <= 168) reasons.push('Bu hafta');
      if (photoBonus) reasons.push('Fotoğraflı');
      if (trustBonus >= 0.10) reasons.push('Güvenilir kullanıcı');
      return { score, distanceKm, reasons };
    }

    try {
      const DATE_PATTERN = /^\(\d+\s+(ay|hafta|yıl|gün|saat|dakika)\s+önce\)$/;
      const fetchLimit = userLat && userLng ? take * 20 : take * 8;

      // Platform yorumları
      const platformRaw = await prisma.review.findMany({
        where: { isPublished: true },
        orderBy: { createdAt: 'desc' },
        take: fetchLimit,
        include: {
          user: { select: { id: true, username: true, fullName: true, avatarUrl: true, trustScore: true, trustLevel: true, badgeLevel: true } },
          business: { select: { id: true, name: true, slug: true, attributes: true, latitude: true, longitude: true } },
          photos: true,
        },
      });

      // Konum varsa yakın işletmeleri önce çek
      let nearbyBizIds = null;
      if (userLat && userLng) {
        const nearbyBiz = await prisma.business.findMany({
          where: {
            latitude: { gte: userLat - 0.5, lte: userLat + 0.5 },
            longitude: { gte: userLng - 0.5, lte: userLng + 0.5 },
            isActive: true,
            isDeleted: false,
          },
          select: { id: true },
          take: 500,
        });
        nearbyBizIds = nearbyBiz.map(b => b.id);
      }

      // External yorumlar
      const extWhere = { isVisible: true, content: { not: null } };
      if (nearbyBizIds && nearbyBizIds.length > 0) {
        extWhere.businessId = { in: nearbyBizIds };
      } else if (city) {
        extWhere.business = { city: { contains: city, mode: 'insensitive' } };
      }

      const externalRaw = await prisma.externalReview.findMany({
        where: extWhere,
        orderBy: { scrapedAt: 'desc' },
        take: fetchLimit,
        include: {
          business: { select: { id: true, name: true, slug: true, attributes: true, latitude: true, longitude: true, totalReviews: true, averageRating: true, category: { select: { name: true } } } },
        },
      });

      // Skor hesapla, sırala, çeşitlilik filtresi (aynı işletmeden max 2)
      const allScored = externalRaw
        .filter(r => { const c = (r.content ?? '').trim(); return c.length >= 15 && !DATE_PATTERN.test(c); })
        .map(r => {
          const biz = r.business ?? {};
          const { score, distanceKm, reasons } = feedScore(r, biz.latitude, biz.longitude);
          return { ...r, _score: score, _distanceKm: distanceKm, _reasons: reasons };
        })
        .sort((a, b) => b._score - a._score);

      const bizCount = {};
      const externalReviews = allScored
        .filter(r => { const id = r.businessId; bizCount[id] = (bizCount[id] || 0) + 1; return bizCount[id] <= 2; })
        .slice(skip, skip + take);

      // Platform yorumları skorla
      const reviews = platformRaw
        .map(r => {
          const biz = r.business ?? {};
          const { score, distanceKm, reasons } = feedScore(r, biz.latitude, biz.longitude);
          return { ...r, _score: score, _distanceKm: distanceKm, _reasons: reasons };
        })
        .sort((a, b) => b._score - a._score)
        .slice(0, Math.ceil(take / 4));

      const totalPlatform = await prisma.review.count({ where: { isPublished: true } });
      const totalExternal = await prisma.externalReview.count({ where: { isVisible: true, content: { not: null } } });

      return reply.code(200).send(fixTurkish({
        reviews,
        externalReviews,
        pagination: {
          page: parseInt(page),
          limit: take,
          total: totalPlatform + totalExternal,
          totalPages: Math.ceil((totalPlatform + totalExternal) / take),
        },
      }));
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Feed alınamadı.' });
    }
  });



  // â”€â”€â”€ GET /business/:businessId â€” İşletme Yorumları â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  fastify.get('/business/:businessId', async (request, reply) => {
    const { businessId } = request.params;
    const { page = 1, limit = 20, rating, sort = 'newest' } = request.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = Math.min(parseInt(limit), 50);

    const orderBy =
      sort === 'helpful'     ? { helpfulCount: 'desc' } :
      sort === 'rating_high' ? { rating: 'desc' } :
      sort === 'rating_low'  ? { rating: 'asc' } :
                               { createdAt: 'desc' };

    try {
      const where = {
        businessId, isPublished: true,
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

  // â”€â”€â”€ GET /my-reviews â€” Kendi Yorumlarım â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  fastify.get('/my-reviews', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { page = 1, limit = 20 } = request.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = Math.min(parseInt(limit), 50);

    try {
      const [reviews, total] = await Promise.all([
        prisma.review.findMany({
          where: { userId: request.user.userId },
          skip, take,
          orderBy: { createdAt: 'desc' },
          include: {
            business: { select: { id: true, name: true, slug: true } },
            photos: true,
          },
        }),
        prisma.review.count({ where: { userId: request.user.userId } }),
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

  // â”€â”€â”€ POST / â€” Yorum Yaz â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    // FormData veya JSON her ikisini kabul et
    let body = request.body || {};
    if (body.businessId === undefined && request.isMultipart && request.isMultipart()) {
      const parts = await request.parts();
      for await (const part of parts) {
        if (part.fieldname) body[part.fieldname] = part.value;
      }
    }
    const { businessId, rating, title, content, photoUrls = [] } = body;

    if (!businessId || !rating || !content) {
      return reply.code(400).send({ error: 'İşletme, puan ve içerik zorunludur.' });
    }
    if (rating < 1 || rating > 5) {
      return reply.code(400).send({ error: 'Puan 1-5 arasında olmalıdır.' });
    }
    if (content.length < 20) {
      return reply.code(400).send({ error: 'Yorum en az 20 karakter olmalıdır.' });
    }

    try {
      const business = await prisma.business.findUnique({
        where: { id: businessId },
        select: { id: true, name: true, ownerId: true, isDeleted: true },
      });
      if (!business || business.isDeleted) {
        return reply.code(404).send({ error: 'İşletme bulunamadı.' });
      }

      const existing = await prisma.review.findUnique({
        where: { userId_businessId: { userId: request.user.userId, businessId } },
      });
      if (existing) {
        return reply.code(409).send({ error: 'Bu işletmeye zaten yorum yazdınız.' });
      }

      const user = await prisma.user.findUnique({
        where: { id: request.user.userId },
        select: { trustScore: true },
      });

      const fraud = detectFraud(content, rating, user.trustScore);
      const isPublished = fraud.automated_action !== 'quarantine';
      const isFlagged   = fraud.automated_action !== 'publish';

      const review = await prisma.review.create({
        data: {
          userId: request.user.userId,
          businessId, rating, title, content,
          isPublished, isFlagged,
          fraudDetectionMetadata: fraud,
          ...(photoUrls.length > 0 && {
            photos: { create: photoUrls.map((url, i) => ({ url, order: i })) },
          }),
        },
        include: {
          user: {
            select: {
              id: true, username: true, fullName: true,
              avatarUrl: true, trustScore: true, trustLevel: true, badgeLevel: true,
            },
          },
          photos: true,
        },
      });

      if (isPublished) {
        await prisma.user.update({
          where: { id: request.user.userId },
          data: { totalReviews: { increment: 1 } },
        });

        await updateBusinessRating(businessId);
        await updateTrustScore(request.user.userId, 'review_published', { reviewId: review.id }).catch(() => {});
        await calculateBadgeLevel(request.user.userId).catch(() => {});
        await recalculateTrustLevel(request.user.userId).catch(() => {})

        // Tecrübe Puanı: yorum +20 TP, fotoğraf varsa +5 TP
        await awardPoints(request.user.userId, 20, 'review_written').catch(() => {})
        if (photoUrls.length > 0) {
          await awardPoints(request.user.userId, 5, 'photo_uploaded').catch(() => {})
        }

        // Kullanıcı zevk vektörünü arka planda güncelle
        recalculateUserVector(request.user.userId).catch(() => {})


// Radar skorlarini yorumlardan otomatik hesapla
async function recalculateRadar(businessId) {
  const reviews = await prisma.$queryRawUnsafe(
    `SELECT rating, "sentimentKeywords" FROM "Review" WHERE "businessId" = $1 AND "isPublished" = true`,
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
    businessId, scores.scoreTeknikYetkinlik, scores.scoreFiyatSeffagligi,
    scores.scoreMusteriIliskileri, scores.scoreGaranti, reviews.length
  )
}

        analyzeSentiment(review.content, rating).then(async (result) => {
          if (!result) return
          await prisma.$executeRawUnsafe(
            `UPDATE "Review" SET "sentiment" = $1, "sentimentScore" = $2, "sentimentKeywords" = $3 WHERE id = $4`,
            result.sentiment, result.score, result.keywords, review.id
          ).catch(() => {})
        }).catch(() => {})

        // Radar skorlarini otomatik guncelle (fire-and-forget)
        recalculateRadar(review.businessId).catch(() => {})


        if (business.ownerId && business.ownerId !== request.user.userId) {
          await prisma.notification.create({
            data: {
              userId: business.ownerId,
              type: 'REVIEW_REPLY',
              title: `${business.name} için yeni yorum`,
              content: `${review.user.fullName || review.user.username} ${rating} yıldız verdi.`,
              metadata: { reviewId: review.id, businessId },
            },
          }).catch(() => {});
        }
      }

      return reply.code(201).send({
        message: isPublished ? 'Yorum başarıyla yayınlandı.' : 'Yorumunuz incelemeye alındı.',
        review,
        fraudDetection: fraud,
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Yorum oluşturulamadı.' });
    }
  });

  // â”€â”€â”€ PUT /:reviewId â€” Yorum Düzenle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  fastify.put('/:reviewId', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { reviewId } = request.params;
    const { rating, title, content } = request.body || {};

    try {
      const review = await prisma.review.findUnique({ where: { id: reviewId } });
      if (!review) return reply.code(404).send({ error: 'Yorum bulunamadı.' });
      if (review.userId !== request.user.userId) {
        return reply.code(403).send({ error: 'Bu yorumu düzenleme yetkiniz yok.' });
      }

      const user = await prisma.user.findUnique({
        where: { id: request.user.userId },
        select: { trustScore: true },
      });

      const newContent = content || review.content;
      const newRating  = rating  || review.rating;
      const fraud = detectFraud(newContent, newRating, user.trustScore);
      const isPublished = fraud.automated_action !== 'quarantine';
      const isFlagged   = fraud.automated_action !== 'publish';

      const updated = await prisma.review.update({
        where: { id: reviewId },
        data: { rating: newRating, title: title || review.title, content: newContent, isPublished, isFlagged, fraudDetectionMetadata: fraud },
        include: {
          business: { select: { id: true, name: true, slug: true } },
          photos: true,
        },
      });

      await updateBusinessRating(review.businessId);
      return reply.code(200).send({ message: 'Yorum güncellendi.', review: updated, fraudDetection: fraud });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Yorum güncellenemedi.' });
    }
  });

  // â”€â”€â”€ DELETE /:reviewId â€” Yorum Sil â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  fastify.delete('/:reviewId', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { reviewId } = request.params;

    try {
      const review = await prisma.review.findUnique({ where: { id: reviewId } });
      if (!review) return reply.code(404).send({ error: 'Yorum bulunamadı.' });
      if (review.userId !== request.user.userId) {
        return reply.code(403).send({ error: 'Bu yorumu silme yetkiniz yok.' });
      }

      await prisma.review.delete({ where: { id: reviewId } });
      await prisma.user.update({
        where: { id: request.user.userId },
        data: { totalReviews: { decrement: 1 } },
      });
      await updateBusinessRating(review.businessId);

      return reply.code(200).send({ message: 'Yorum silindi.' });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Yorum silinemedi.' });
    }
  });

  // â”€â”€â”€ POST /:reviewId/vote â€” Faydalı/Faydasız Oyu â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  fastify.post('/:reviewId/vote', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { reviewId } = request.params;
    const { isHelpful } = request.body || {};

    if (typeof isHelpful !== 'boolean') {
      return reply.code(400).send({ error: 'isHelpful alanı boolean olmalıdır.' });
    }

    try {
      const review = await prisma.review.findUnique({
        where: { id: reviewId },
        select: { id: true, userId: true, isPublished: true },
      });
      if (!review) return reply.code(404).send({ error: 'Yorum bulunamadı.' });
      if (!review.isPublished) return reply.code(400).send({ error: 'Yayınlanmamış yorumlar oylanamaz.' });
      if (review.userId === request.user.userId) {
        return reply.code(400).send({ error: 'Kendi yorumunuzu oylayamazsınız.' });
      }

      const existing = await prisma.reviewVote.findUnique({
        where: { reviewId_userId: { reviewId, userId: request.user.userId } },
      });

      if (existing) {
        if (existing.isHelpful === isHelpful) {
          await prisma.$transaction([
            prisma.reviewVote.delete({ where: { id: existing.id } }),
            prisma.review.update({
              where: { id: reviewId },
              data: {
                helpfulCount:    isHelpful  ? { decrement: 1 } : undefined,
                notHelpfulCount: !isHelpful ? { decrement: 1 } : undefined,
              },
            }),
          ]);
          return reply.code(200).send({ voted: null, message: 'Oy geri alındı.' });
        }
        await prisma.$transaction([
          prisma.reviewVote.update({ where: { id: existing.id }, data: { isHelpful } }),
          prisma.review.update({
            where: { id: reviewId },
            data: {
              helpfulCount:    isHelpful ? { increment: 1 } : { decrement: 1 },
              notHelpfulCount: isHelpful ? { decrement: 1 } : { increment: 1 },
            },
          }),
        ]);
        return reply.code(200).send({ voted: isHelpful, message: 'Oy güncellendi.' });
      }

      await prisma.$transaction([
        prisma.reviewVote.create({ data: { reviewId, userId: request.user.userId, isHelpful } }),
        prisma.review.update({
          where: { id: reviewId },
          data: {
            helpfulCount:    isHelpful  ? { increment: 1 } : undefined,
            notHelpfulCount: !isHelpful ? { increment: 1 } : undefined,
          },
        }),
      ]);

      if (isHelpful) {
        await prisma.user.update({ where: { id: review.userId }, data: { helpfulVotes: { increment: 1 } } });
        await updateTrustScore(review.userId, 'helpful_vote', { reviewId, votedBy: request.user.userId }).catch(() => {});
        await calculateBadgeLevel(review.userId).catch(() => {});
        // Tecrübe Puanı: faydalı oy +5 TP (yorum sahibine)
        await awardPoints(review.userId, 5, 'helpful_vote').catch(() => {})
      }

      return reply.code(200).send({ voted: isHelpful, message: 'Oy kaydedildi.' });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Oy kaydedilemedi.' });
    }
  });

  // â”€â”€â”€ POST /:reviewId/report â€” Åikayet â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  fastify.post('/:reviewId/report', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { reviewId } = request.params;
    const { reason, description } = request.body || {};

    const validReasons = ['SPAM', 'INAPPROPRIATE', 'FAKE_REVIEW', 'HARASSMENT', 'COPYRIGHT', 'OTHER'];
    if (!reason || !validReasons.includes(reason)) {
      return reply.code(400).send({ error: `Geçersiz şikayet nedeni. Geçerliler: ${validReasons.join(', ')}` });
    }

    try {
      const review = await prisma.review.findUnique({ where: { id: reviewId } });
      if (!review) return reply.code(404).send({ error: 'Yorum bulunamadı.' });

      await prisma.report.create({
        data: { reporterId: request.user.userId, reportedReviewId: reviewId, reason, description },
      });

      return reply.code(201).send({ message: 'Åikayetiniz alındı, incelenecek.' });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Åikayet gönderilemedi.' });
    }
  });


  // --- PATCH /:id/owner-reply -- Sahip Yaniti ---
  fastify.patch('/:id/owner-reply', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params
    const { ownerReply } = request.body || {}
    try {
      const review = await prisma.review.findUnique({
        where: { id },
        include: { business: { select: { ownerId: true } } }
      })
      if (!review) return reply.code(404).send({ error: 'Yorum bulunamadi.' })
      if (review.business.ownerId !== request.user.userId) {
        return reply.code(403).send({ error: 'Bu yoruma yanit verme yetkiniz yok.' })
      }
      const updated = await prisma.review.update({
        where: { id },
        data: { ownerReply: ownerReply || null, ownerReplyDate: ownerReply ? new Date() : null }
      })
      // Bildirim gonder
      notifyOwnerReply({ review: updated, business: { id: updated.businessId, name: '', slug: '' } }).catch(() => {})
      return reply.send({ ok: true, ownerReply: updated.ownerReply })
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: 'Yanit kaydedilemedi.' })
    }
  })

  // --- POST /:id/ai-draft -- AI Yanit Taslagi ---
  fastify.post('/:id/ai-draft', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params
    try {
      const review = await prisma.review.findUnique({
        where: { id },
        include: {
          business: { select: { ownerId: true, name: true } },
          user: { select: { username: true } }
        }
      })
      if (!review) return reply.code(404).send({ error: 'Yorum bulunamadi.' })
      if (review.business.ownerId !== request.user.userId) {
        return reply.code(403).send({ error: 'Bu yoruma erisim yetkiniz yok.' })
      }

      const rating = review.rating
      const tone = rating >= 4 ? 'samimi ve tesekkur eden' : rating === 3 ? 'anlayisli ve yapici' : 'ozur dileyen ve cozum odakli'

      const prompt = "Bir işletme sahibi olarak müşteri yorumuna kısa, samimi ve profesyonel Türkçe bir yanıt yaz. " +
        "Yanıt 2-3 cümle olsun. Müşteriyi ismiyle değil 'değerli misafirimiz' diye hitap et. " +
        "Sadece yanıt metnini yaz, başka hiçbir şey ekleme, tırnak işareti kullanma.\n\n" +
        "İşletme adı: " + review.business.name + "\n" +
        "Yorum puanı: " + rating + "/5\n" +
        "Müşteri yorumu: " + review.content + "\n\n" +
        "Yanıt:"

      const ollamaRes = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama3.2:3b',
          prompt,
          stream: false,
          options: { temperature: 0.7, num_predict: 200 }
        })
      })

      if (!ollamaRes.ok) {
        return reply.code(503).send({ error: 'AI servisi su an kullanilamiyor.' })
      }

      const data = await ollamaRes.json()
      const draft = data.response?.trim() ?? ''

      return reply.send({ ok: true, draft })
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: 'AI taslak olusturulamadi.' })
    }
  })



}
// â”€â”€â”€ Yardımcı â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function updateBusinessRating(businessId) {
  const result = await prisma.review.aggregate({
    where: { businessId, isPublished: true, isFlagged: false },
    _avg: { rating: true },
    _count: { rating: true },
  });
  await prisma.business.update({
    where: { id: businessId },
    data: {
      averageRating: result._avg.rating || 0,
      totalReviews:  result._count.rating,
    },
  });
}
export default reviewRoutes;
