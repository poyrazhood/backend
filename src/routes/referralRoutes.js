import prisma from '../lib/prisma.js'

async function requireAdmin(request, reply) {
  const secret = request.headers['x-admin-secret']
  if (secret !== 'tecrube_admin_2026') {
    return reply.code(401).send({ error: 'Yetkisiz.' })
  }
}

export default async function referralRoutes(fastify) {

  fastify.get('/validate/:code', async (req, reply) => {
    const code = await prisma.referralCode.findUnique({
      where: { code: req.params.code.toUpperCase() },
      select: {
        id: true, code: true, isActive: true,
        maxUses: true, totalUses: true, expiresAt: true,
        rewardBadge: true, rewardNote: true,
        campaign: { select: { name: true } },
      },
    })
    if (!code || !code.isActive) return reply.send({ valid: false, reason: 'Kod bulunamadi.' })
    if (code.expiresAt && new Date(code.expiresAt) < new Date())
      return reply.send({ valid: false, reason: 'Kodun suresi dolmus.' })
    if (code.maxUses && code.totalUses >= code.maxUses)
      return reply.send({ valid: false, reason: 'Limit doldu.' })
    return reply.send({
      valid: true,
      code: code.code,
      campaign: code.campaign?.name ?? null,
      rewardNote: code.rewardNote ?? null,
    })
  })

  fastify.get('/admin/campaigns', async (req, reply) => {
    await requireAdmin(req, reply)
    const campaigns = await prisma.referralCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { codes: true } },
        codes: { select: { totalUses: true, activeUsers: true } },
      },
    })
    const result = campaigns.map(c => ({
      id: c.id, name: c.name, description: c.description,
      isActive: c.isActive, createdAt: c.createdAt,
      totalCodes: c._count.codes,
      totalUses: c.codes.reduce((s, x) => s + x.totalUses, 0),
      activeUsers: c.codes.reduce((s, x) => s + x.activeUsers, 0),
    }))
    return reply.send(result)
  })

  fastify.post('/admin/campaigns', async (req, reply) => {
    await requireAdmin(req, reply)
    const { name, description } = req.body
    if (!name) return reply.code(400).send({ error: 'Isim zorunlu.' })
    const campaign = await prisma.referralCampaign.create({
      data: { name, description, createdBy: 'admin' },
    })
    return reply.code(201).send(campaign)
  })

  fastify.patch('/admin/campaigns/:id', async (req, reply) => {
    await requireAdmin(req, reply)
    const { isActive, name, description } = req.body
    const campaign = await prisma.referralCampaign.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(isActive !== undefined && { isActive }),
      },
    })
    return reply.send(campaign)
  })

  fastify.get('/admin/codes', async (req, reply) => {
    await requireAdmin(req, reply)
    const { campaignId, search } = req.query
    const codes = await prisma.referralCode.findMany({
      where: {
        ...(campaignId ? { campaignId } : {}),
        ...(search ? { code: { contains: search.toUpperCase() } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        campaign: { select: { name: true } },
        _count: { select: { uses: true } },
      },
    })
    return reply.send(codes)
  })

  fastify.post('/admin/codes', async (req, reply) => {
    await requireAdmin(req, reply)
    const { code, campaignId, maxUses, expiresAt, rewardBadge, rewardNote } = req.body
    if (!code) return reply.code(400).send({ error: 'Kod zorunlu.' })
    const existing = await prisma.referralCode.findUnique({ where: { code: code.toUpperCase() } })
    if (existing) return reply.code(409).send({ error: 'Bu kod zaten kullan?mda.' })
    const created = await prisma.referralCode.create({
      data: {
        code: code.toUpperCase(),
        ...(campaignId && { campaignId }),
        ...(maxUses && { maxUses: parseInt(maxUses) }),
        ...(expiresAt && { expiresAt: new Date(expiresAt) }),
        ...(rewardBadge && { rewardBadge }),
        ...(rewardNote && { rewardNote }),
      },
    })
    return reply.code(201).send(created)
  })

  fastify.patch('/admin/codes/:id', async (req, reply) => {
    await requireAdmin(req, reply)
    const { isActive, maxUses, expiresAt, rewardBadge, rewardNote, campaignId } = req.body
    const updated = await prisma.referralCode.update({
      where: { id: req.params.id },
      data: {
        ...(isActive !== undefined && { isActive }),
        ...(maxUses !== undefined && { maxUses: maxUses === null ? null : parseInt(maxUses) }),
        ...(expiresAt !== undefined && { expiresAt: expiresAt === null ? null : new Date(expiresAt) }),
        ...(rewardBadge !== undefined && { rewardBadge }),
        ...(rewardNote !== undefined && { rewardNote }),
        ...(campaignId !== undefined && { campaignId }),
      },
    })
    return reply.send(updated)
  })

  fastify.delete('/admin/codes/:id', async (req, reply) => {
    await requireAdmin(req, reply)
    const uses = await prisma.referralUse.count({ where: { referralCodeId: req.params.id } })
    if (uses > 0) return reply.code(409).send({ error: 'Kullanilmis kodlar silinemez.' })
    await prisma.referralCode.delete({ where: { id: req.params.id } })
    return reply.send({ success: true })
  })

  fastify.get('/admin/codes/:id/users', async (req, reply) => {
    await requireAdmin(req, reply)
    const { page = '1', limit = '20' } = req.query
    const skip = (parseInt(page) - 1) * parseInt(limit)
    const [uses, total] = await Promise.all([
      prisma.referralUse.findMany({
        where: { referralCodeId: req.params.id },
        orderBy: { usedAt: 'desc' },
        skip, take: parseInt(limit),
        include: {
          user: {
            select: {
              id: true, username: true, fullName: true,
              avatarUrl: true, createdAt: true,
              _count: { select: { reviews: true } },
            },
          },
        },
      }),
      prisma.referralUse.count({ where: { referralCodeId: req.params.id } }),
    ])
    return reply.send({ uses, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) })
  })

  fastify.get('/admin/stats', async (req, reply) => {
    await requireAdmin(req, reply)
    const [totalCodes, activeCodes, totalUses, last30Days] = await Promise.all([
      prisma.referralCode.count(),
      prisma.referralCode.count({ where: { isActive: true } }),
      prisma.referralUse.count(),
      prisma.referralUse.count({
        where: { usedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      }),
    ])
    const daily = []
    return reply.send({ totalCodes, activeCodes, totalUses, last30Days, daily })
  })
}
