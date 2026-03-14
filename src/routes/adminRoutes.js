import { prisma } from '../index.js'
import { recalculateAutoBadges } from '../services/badgeService.js'

async function adminRoutes(fastify) {

  const adminAuth = async (request, reply) => {
    const secret = request.headers['x-admin-secret']
    if (!secret || secret !== process.env.ADMIN_SECRET) {
      return reply.code(401).send({ error: 'Yetkisiz.' })
    }
  }

  fastify.get('/stats', { preHandler: [adminAuth] }, async (request, reply) => {
    const [users, businesses, reviews, pendingClaims] = await Promise.all([
      prisma.user.count(),
      prisma.business.count({ where: { isDeleted: false } }),
      prisma.review.count(),
      prisma.businessClaimHistory.count({ where: { status: 'PENDING' } })
    ])
    return reply.send({ users, businesses, reviews, pendingClaims })
  })

  fastify.get('/moderation-stats', { preHandler: [adminAuth] }, async (request, reply) => {
    const [pendingReports, flaggedReviews, pendingClaims] = await Promise.all([
      prisma.report.count({ where: { status: 'PENDING' } }),
      prisma.review.count({ where: { OR: [{ isFlagged: true }, { reports: { some: { status: 'PENDING' } } }] } }),
      prisma.businessClaimHistory.count({ where: { status: 'PENDING' } })
    ])
    return reply.send({ pendingReports, flaggedReviews, pendingClaims })
  })

  fastify.get('/claims', { preHandler: [adminAuth] }, async (request, reply) => {
    const { status = 'PENDING', page = 1 } = request.query
    const skip = (parseInt(page) - 1) * 20
    const [claims, total] = await Promise.all([
      prisma.businessClaimHistory.findMany({
        where: status === 'ALL' ? {} : { status },
        include: {
          business: { select: { id: true, name: true, slug: true, city: true, district: true, claimStatus: true } },
          user: { select: { id: true, username: true, fullName: true, email: true, createdAt: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip, take: 20
      }),
      prisma.businessClaimHistory.count({ where: status === 'ALL' ? {} : { status } })
    ])
    return reply.send({ claims, total })
  })

  fastify.patch('/claims/:id', { preHandler: [adminAuth] }, async (request, reply) => {
    const { id } = request.params
    const { action } = request.body
    const claim = await prisma.businessClaimHistory.findUnique({ where: { id }, include: { business: true } })
    if (!claim) return reply.code(404).send({ error: 'Talep bulunamadi.' })
    if (action === 'approve') {
      await prisma.$transaction([
        prisma.businessClaimHistory.update({ where: { id }, data: { status: 'CLAIMED' } }),
        prisma.business.update({ where: { id: claim.businessId }, data: { claimStatus: 'CLAIMED', ownerId: claim.userId } })
      ])
    } else {
      await prisma.$transaction([
        prisma.businessClaimHistory.update({ where: { id }, data: { status: 'UNCLAIMED' } }),
        prisma.business.update({ where: { id: claim.businessId }, data: { claimStatus: 'UNCLAIMED' } })
      ])
    }
    return reply.send({ ok: true })
  })

  fastify.get('/businesses', { preHandler: [adminAuth] }, async (request, reply) => {
    const { page = 1, search = '' } = request.query
    const skip = (parseInt(page) - 1) * 20
    const where = search ? { name: { contains: search, mode: 'insensitive' }, isDeleted: false } : { isDeleted: false }
    const [businesses, total] = await Promise.all([
      prisma.business.findMany({
        where,
        select: { id: true, name: true, slug: true, city: true, district: true, claimStatus: true, isVerified: true, averageRating: true, totalReviews: true, createdAt: true,
          category: { select: { name: true } }, owner: { select: { username: true } } },
        orderBy: { createdAt: 'desc' }, skip, take: 20
      }),
      prisma.business.count({ where })
    ])
    return reply.send({ businesses, total })
  })

  fastify.get('/users', { preHandler: [adminAuth] }, async (request, reply) => {
    const { page = 1, search = '' } = request.query
    const skip = (parseInt(page) - 1) * 20
    const where = search ? { OR: [{ username: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] } : {}
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: { id: true, username: true, fullName: true, email: true, trustScore: true, trustLevel: true, totalReviews: true, isBanned: true, createdAt: true, badgeLevel: true },
        orderBy: { createdAt: 'desc' }, skip, take: 20
      }),
      prisma.user.count({ where })
    ])
    return reply.send({ users, total })
  })

  fastify.patch('/users/:id/ban', { preHandler: [adminAuth] }, async (request, reply) => {
    const { id } = request.params
    const { ban, reason } = request.body
    await prisma.user.update({ where: { id }, data: { isBanned: ban, banReason: reason || null } })
    return reply.send({ ok: true })
  })

  fastify.get('/reviews', { preHandler: [adminAuth] }, async (request, reply) => {
    const { page = 1 } = request.query
    const skip = (parseInt(page) - 1) * 20
    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        select: { id: true, content: true, rating: true, createdAt: true, isVerified: true, isFlagged: true,
          user: { select: { username: true } }, business: { select: { name: true, slug: true } } },
        orderBy: { createdAt: 'desc' }, skip, take: 20
      }),
      prisma.review.count()
    ])
    return reply.send({ reviews, total })
  })

  fastify.delete('/reviews/:id', { preHandler: [adminAuth] }, async (request, reply) => {
    await prisma.review.delete({ where: { id: request.params.id } })
    return reply.send({ ok: true })
  })

  fastify.get('/flagged-reviews', { preHandler: [adminAuth] }, async (request, reply) => {
    const { page = 1 } = request.query
    const skip = (parseInt(page) - 1) * 20
    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where: { OR: [{ isFlagged: true }, { reports: { some: {} } }] },
        include: {
          user: { select: { id: true, username: true, trustScore: true } },
          business: { select: { id: true, name: true, slug: true } },
          reports: { select: { id: true, reason: true, status: true, createdAt: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip, take: 20
      }),
      prisma.review.count({ where: { OR: [{ isFlagged: true }, { reports: { some: {} } }] } })
    ])
    return reply.send({ reviews, total })
  })

  fastify.patch('/reviews/:id/flag', { preHandler: [adminAuth] }, async (request, reply) => {
    const { isFlagged, flagReason, isPublished } = request.body
    await prisma.review.update({
      where: { id: request.params.id },
      data: {
        ...(isFlagged !== undefined && { isFlagged }),
        ...(flagReason !== undefined && { flagReason }),
        ...(isPublished !== undefined && { isPublished })
      }
    })
    return reply.send({ ok: true })
  })

  fastify.get('/reports', { preHandler: [adminAuth] }, async (request, reply) => {
    const { status = 'PENDING', page = 1 } = request.query
    const skip = (parseInt(page) - 1) * 20
    const where = status === 'ALL' ? {} : { status }
    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        include: {
          reporter: { select: { id: true, username: true } },
          reportedUser: { select: { id: true, username: true } },
          reportedReview: {
            select: {
              id: true, content: true, rating: true, isFlagged: true,
              user: { select: { username: true } },
              business: { select: { name: true, slug: true } }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip, take: 20
      }),
      prisma.report.count({ where })
    ])
    return reply.send({ reports, total })
  })

  fastify.patch('/reports/:id', { preHandler: [adminAuth] }, async (request, reply) => {
    const { action, resolution } = request.body
    const statusMap = { resolve: 'RESOLVED', dismiss: 'DISMISSED', reviewing: 'REVIEWING' }
    const status = statusMap[action]
    if (!status) return reply.code(400).send({ error: 'Gecersiz action.' })
    await prisma.report.update({
      where: { id: request.params.id },
      data: {
        status,
        resolution: resolution || null,
        resolvedAt: ['RESOLVED', 'DISMISSED'].includes(status) ? new Date() : null
      }
    })
    return reply.send({ ok: true })
  })


  // ─── ROZET YÖNETİMİ ──────────────────────────────────────────────────────────

  // GET /api/admin/businesses/:id/badges — İşletme rozetleri
  fastify.get('/businesses/:id/badges', { preHandler: [adminAuth] }, async (request, reply) => {
    const { id } = request.params
    const badges = await prisma.businessBadge.findMany({
      where: { businessId: id },
      orderBy: { awardedAt: 'desc' }
    })
    return reply.send(badges)
  })

  // POST /api/admin/businesses/:id/badges — Rozet ata
  fastify.post('/businesses/:id/badges', { preHandler: [adminAuth] }, async (request, reply) => {
    const { id } = request.params
    const { type, expiresAt } = request.body || {}
    const validTypes = ['VERIFIED', 'NEIGHBORHOOD_FAVORITE', 'FEATURED', 'PREMIUM', 'TOP_RATED', 'HIGHLY_REVIEWED', 'NEW_BUSINESS', 'TRUSTED']
    if (!validTypes.includes(type)) {
      return reply.code(400).send({ error: 'Geçersiz rozet tipi.' })
    }
    const badge = await prisma.businessBadge.upsert({
      where: { businessId_type: { businessId: id, type } },
      update: { isActive: true, expiresAt: expiresAt || null },
      create: { id: `${id}_${type}`, businessId: id, type, expiresAt: expiresAt || null, isActive: true }
    })
    return reply.send(badge)
  })

  // DELETE /api/admin/businesses/:id/badges/:type — Rozet kaldır
  fastify.delete('/businesses/:id/badges/:type', { preHandler: [adminAuth] }, async (request, reply) => {
    const { id, type } = request.params
    await prisma.businessBadge.updateMany({
      where: { businessId: id, type },
      data: { isActive: false }
    })
    return reply.send({ ok: true })
  })

  // POST /api/admin/badges/recalculate — Otomatik rozetleri yeniden hesapla
  fastify.post('/badges/recalculate', { preHandler: [adminAuth] }, async (request, reply) => {
    const results = await recalculateAutoBadges()
    return reply.send(results)
  })

  // ─── SITE CONFIG ─────────────────────────────────────────────────────────────

  // GET /api/admin/site-config — Tum ayarlar
  fastify.get('/site-config', { preHandler: [adminAuth] }, async (request, reply) => {
    const configs = await prisma.$queryRawUnsafe('SELECT * FROM "SiteConfig"')
    return reply.send(configs)
  })

  // PATCH /api/admin/site-config/:key — Ayar guncelle
  fastify.patch('/site-config/:key', { preHandler: [adminAuth] }, async (request, reply) => {
    const { key } = request.params
    const { value } = request.body
    await prisma.$queryRawUnsafe(
      'INSERT INTO "SiteConfig" ("key", "value", "updatedAt") VALUES ($1, $2, NOW()) ON CONFLICT ("key") DO UPDATE SET "value" = $2, "updatedAt" = NOW()',
      key, value
    )
    return reply.send({ ok: true })
  })

}
export default adminRoutes
