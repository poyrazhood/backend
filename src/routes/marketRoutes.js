import prisma from '../lib/prisma.js'
// marketRoutes.js â€“ TecrÃ¼be PazarÄ± API

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'tecrube_admin_2026'
function isAdmin(req) {
  return req.headers['x-admin-secret'] === ADMIN_SECRET
}

export default async function marketRoutes(fastify) {

  // â”€â”€ PUBLIC: Aktif Ã¼rÃ¼nleri listele â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  fastify.get('/api/market-items', async (req, reply) => {
    try {
      const items = await prisma.marketItem.findMany({
        where: { isActive: true },
        orderBy: { pointCost: 'asc' },
      })
      return reply.send(items)
    } catch (e) {
      return reply.status(500).send({ error: e.message })
    }
  })

  // â”€â”€ PUBLIC: Tek Ã¼rÃ¼n â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  fastify.get('/api/market-items/:id', async (req, reply) => {
    try {
      const item = await prisma.marketItem.findUnique({ where: { id: req.params.id } })
      if (!item) return reply.status(404).send({ error: 'ÃœrÃ¼n bulunamadÄ±' })
      return reply.send(item)
    } catch (e) {
      return reply.status(500).send({ error: e.message })
    }
  })

  // â”€â”€ USER: Puan geÃ§miÅŸi â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  fastify.get('/api/market/points/log', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const userId = request.user.userId
      const limit  = Math.min(parseInt(request.query.limit ?? '20'), 50)

      const [logs, user] = await Promise.all([
        prisma.marketPointLog.findMany({
          where:   { userId },
          orderBy: { createdAt: 'desc' },
          take:    limit,
          select:  { id: true, points: true, reason: true, description: true, createdAt: true }
        }),
        prisma.user.findUnique({
          where:  { id: userId },
          select: { currentPoints: true, totalEarnedPoints: true }
        })
      ])

      return reply.send({
        logs,
        currentPoints:     user?.currentPoints     ?? 0,
        totalEarnedPoints: user?.totalEarnedPoints ?? 0,
      })
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: 'Puan geÃ§miÅŸi alÄ±namadÄ±.' })
    }
  })

  // â”€â”€ USER: ÃœrÃ¼n satÄ±n al â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  fastify.post('/api/market-items/:id/redeem', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const userId = req.user.userId ?? req.user.id
    const itemId = req.params.id
    try {
      const item = await prisma.marketItem.findUnique({ where: { id: itemId } })
      if (!item || !item.isActive) return reply.status(404).send({ error: 'ÃœrÃ¼n bulunamadÄ±' })

      const user = await prisma.user.findUnique({ where: { id: userId } })
      if (!user) return reply.status(404).send({ error: 'KullanÄ±cÄ± bulunamadÄ±' })

      if ((user.currentPoints || 0) < item.pointCost)
        return reply.status(400).send({ error: 'Yetersiz puan', required: item.pointCost, current: user.currentPoints })

      if (item.stock !== -1 && item.stock <= 0)
        return reply.status(400).send({ error: 'Stok tÃ¼kendi' })

      await prisma.$transaction([
        prisma.marketPurchase.create({
          data: { userId, itemId, pointsSpent: item.pointCost, deliveryInfo: req.body?.deliveryInfo || null }
        }),
        prisma.user.update({
          where: { id: userId },
          data:  { currentPoints: { decrement: item.pointCost } }
        }),
        prisma.marketItem.update({
          where: { id: itemId },
          data: {
            totalRedeemed: { increment: 1 },
            ...(item.stock !== -1 && { stock: { decrement: 1 } })
          }
        }),
        prisma.marketPointLog.create({
          data: {
            userId,
            points:      -item.pointCost,
            reason:      'PURCHASE',
            description: `SatÄ±n alÄ±ndÄ±: ${item.name}`,
          }
        })
      ])

      return reply.send({ success: true, remainingPoints: (user.currentPoints || 0) - item.pointCost })
    } catch (e) {
      return reply.status(500).send({ error: e.message })
    }
  })

  // â”€â”€ USER: SatÄ±n alma geÃ§miÅŸi â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  fastify.get('/api/market-items/my-purchases', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    try {
      const purchases = await prisma.marketPurchase.findMany({
        where:   { userId: req.user.userId ?? req.user.id },
        include: { item: true },
        orderBy: { createdAt: 'desc' }
      })
      return reply.send(purchases)
    } catch (e) {
      return reply.status(500).send({ error: e.message })
    }
  })

  // â”€â”€ ADMIN: TÃ¼m Ã¼rÃ¼nleri listele â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  fastify.get('/api/admin/market-items', async (req, reply) => {
    if (!isAdmin(req)) return reply.status(403).send({ error: 'Yetkisiz' })
    try {
      const items = await prisma.marketItem.findMany({ orderBy: { createdAt: 'desc' } })
      return reply.send(items)
    } catch (e) {
      return reply.status(500).send({ error: e.message })
    }
  })

  // â”€â”€ ADMIN: Yeni Ã¼rÃ¼n ekle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  fastify.post('/api/admin/market-items', async (req, reply) => {
    if (!isAdmin(req)) return reply.status(403).send({ error: 'Yetkisiz' })
    const { name, description, pointCost, category, imageUrl, stock, isActive } = req.body
    if (!name || !pointCost) return reply.status(400).send({ error: 'Ä°sim ve puan maliyeti zorunlu' })
    try {
      const item = await prisma.marketItem.create({
        data: {
          name,
          description: description || null,
          pointCost:   parseInt(pointCost),
          category:    category  || 'BADGE',
          imageUrl:    imageUrl  || null,
          stock:       stock     ?? -1,
          isActive:    isActive  ?? true,
        }
      })
      return reply.status(201).send(item)
    } catch (e) {
      return reply.status(500).send({ error: e.message })
    }
  })

  // â”€â”€ ADMIN: ÃœrÃ¼n gÃ¼ncelle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  fastify.put('/api/admin/market-items/:id', async (req, reply) => {
    if (!isAdmin(req)) return reply.status(403).send({ error: 'Yetkisiz' })
    const { name, description, pointCost, category, imageUrl, stock, isActive } = req.body
    try {
      const item = await prisma.marketItem.update({
        where: { id: req.params.id },
        data: {
          ...(name                !== undefined && { name }),
          ...(description        !== undefined && { description }),
          ...(pointCost          !== undefined && { pointCost: parseInt(pointCost) }),
          ...(category           !== undefined && { category }),
          ...(imageUrl           !== undefined && { imageUrl }),
          ...(stock              !== undefined && { stock }),
          ...(isActive           !== undefined && { isActive }),
        }
      })
      return reply.send(item)
    } catch (e) {
      return reply.status(500).send({ error: e.message })
    }
  })

  // â”€â”€ ADMIN: ÃœrÃ¼n sil â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  fastify.delete('/api/admin/market-items/:id', async (req, reply) => {
    if (!isAdmin(req)) return reply.status(403).send({ error: 'Yetkisiz' })
    try {
      await prisma.marketItem.delete({ where: { id: req.params.id } })
      return reply.send({ success: true })
    } catch (e) {
      return reply.status(500).send({ error: e.message })
    }
  })
}
