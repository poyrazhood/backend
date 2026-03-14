import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()

const PLANS = {
  FREE:         { price: 0,   durationDays: 36500, features: [] },
  PROFESSIONAL: { price: 99,  durationDays: 30,    features: ["analytics","badge","reply"] },
  PREMIUM:      { price: 299, durationDays: 30,    features: ["analytics","badge","reply","boost","featured","ad_free"] },
  ENTERPRISE:   { price: 999, durationDays: 30,    features: ["analytics","badge","reply","boost","featured","ad_free","api","white_label"] },
}

async function subscriptionRoutes(fastify, options) {

  // GET /api/subscriptions/plans — Plan listesi (public)
  fastify.get("/plans", async (request, reply) => {
    return reply.send(PLANS)
  })

  // GET /api/subscriptions/business/:businessId — Aktif plan bilgisi
  fastify.get("/business/:businessId", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { businessId } = request.params
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, subscriptionPlan: true, subscriptionEndsAt: true, ownerId: true }
    })
    if (!business) return reply.code(404).send({ error: "Isletme bulunamadi" })
    const isAdmin = request.headers["x-admin-secret"] === process.env.ADMIN_SECRET
    if (business.ownerId !== request.user.userId && !isAdmin) {
      return reply.code(403).send({ error: "Yetkisiz" })
    }
    const activeSub = await prisma.businessSubscription.findFirst({
      where: { businessId, status: "ACTIVE" },
      orderBy: { endsAt: "desc" }
    })
    return reply.send({ plan: business.subscriptionPlan, endsAt: business.subscriptionEndsAt, subscription: activeSub })
  })

  // POST /api/subscriptions/business/:businessId/upgrade — Plan yukselт (admin veya odeme sonrasi)
  fastify.post("/business/:businessId/upgrade", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { businessId } = request.params
    const { plan, notes } = request.body
    if (!PLANS[plan]) return reply.code(400).send({ error: "Gecersiz plan" })
    const business = await prisma.business.findUnique({ where: { id: businessId }, select: { ownerId: true } })
    if (!business) return reply.code(404).send({ error: "Isletme bulunamadi" })
    const isAdmin = request.headers["x-admin-secret"] === process.env.ADMIN_SECRET
    if (business.ownerId !== request.user.userId && !isAdmin) {
      return reply.code(403).send({ error: "Yetkisiz" })
    }
    const now = new Date()
    const endsAt = new Date(now.getTime() + PLANS[plan].durationDays * 24 * 60 * 60 * 1000)
    // Eski aktif subscriptionlari kapat
    await prisma.businessSubscription.updateMany({
      where: { businessId, status: "ACTIVE" },
      data: { status: "CANCELLED" }
    })
    // Yeni subscription olustur
    const sub = await prisma.businessSubscription.create({
      data: {
        id: crypto.randomUUID(),
        businessId,
        plan,
        endsAt,
        price: PLANS[plan].price,
        status: "ACTIVE",
        createdBy: request.user.userId,
        notes: notes || null
      }
    })
    // Business tablosunu guncelle
    await prisma.business.update({
      where: { id: businessId },
      data: { subscriptionPlan: plan, subscriptionEndsAt: endsAt }
    })
    return reply.send({ ok: true, plan, endsAt, subscription: sub })
  })

  // POST /api/subscriptions/business/:businessId/cancel — Iptal
  fastify.post("/business/:businessId/cancel", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const adminSecret = request.headers["x-admin-secret"]
    if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) return reply.code(403).send({ error: "Yetkisiz" })
    const { businessId } = request.params
    await prisma.businessSubscription.updateMany({
      where: { businessId, status: "ACTIVE" },
      data: { status: "CANCELLED" }
    })
    await prisma.business.update({
      where: { id: businessId },
      data: { subscriptionPlan: "FREE", subscriptionEndsAt: null }
    })
    return reply.send({ ok: true })
  })

  // GET /api/subscriptions/admin/list — Admin: tum subscriptionlar
  fastify.get("/admin/list", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const adminSecret = request.headers["x-admin-secret"]
    if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) return reply.code(403).send({ error: "Yetkisiz" })
    const { plan, status = "ACTIVE", page = 1 } = request.query
    const where = { status, ...(plan ? { plan } : {}) }
    const take = 20
    const skip = (Number(page) - 1) * take
    const [subs, total] = await Promise.all([
      prisma.businessSubscription.findMany({
        where, take, skip,
        orderBy: { createdAt: "desc" },
        include: { business: { select: { id: true, name: true, slug: true, city: true } } }
      }),
      prisma.businessSubscription.count({ where })
    ])
    return reply.send({ subs, total, totalPages: Math.ceil(total / take) })
  })




  // POST /api/subscriptions/request — Yukseltme talebi gonder
  fastify.post("/request", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { businessId, planWanted, phone, note } = request.body
    if (!businessId || !planWanted) return reply.code(400).send({ error: "Eksik alan" })
    const business = await prisma.business.findUnique({ where: { id: businessId }, select: { ownerId: true, name: true } })
    if (!business) return reply.code(404).send({ error: "Isletme bulunamadi" })
    if (business.ownerId !== request.user.userId) return reply.code(403).send({ error: "Yetkisiz" })
    // Ayni plan icin bekleyen talep var mi?
    const existing = await prisma.$queryRawUnsafe(
      `SELECT id FROM "UpgradeRequest" WHERE "businessId" = $1 AND "planWanted" = $2 AND status = 'PENDING' LIMIT 1`,
      businessId, planWanted
    )
    if (existing.length > 0) return reply.code(400).send({ error: "Bu plan icin zaten bekleyen talebiniz var" })
    await prisma.$executeRawUnsafe(
      `INSERT INTO "UpgradeRequest" ("id","businessId","userId","planWanted","phone","note","status","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,'PENDING',NOW(),NOW())`,
      crypto.randomUUID(), businessId, request.user.userId, planWanted, phone || null, note || null
    )
    return reply.send({ ok: true })
  })

  // GET /api/subscriptions/admin/requests — Admin: tum talepler
  fastify.get("/admin/requests", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const adminSecret = request.headers["x-admin-secret"]
    if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) return reply.code(403).send({ error: "Yetkisiz" })
    const { status = "PENDING" } = request.query
    const rows = await prisma.$queryRawUnsafe(`
      SELECT r.*, b.name as "businessName", b.city as "businessCity", u.username, u."fullName", u.email
      FROM "UpgradeRequest" r
      LEFT JOIN "Business" b ON b.id = r."businessId"
      LEFT JOIN "User" u ON u.id = r."userId"
      WHERE r.status = $1
      ORDER BY r."createdAt" DESC
      LIMIT 50
    `, status)
    return reply.send({ requests: rows })
  })

  // PATCH /api/subscriptions/admin/requests/:id — Admin: talep durumunu guncelle
  fastify.patch("/admin/requests/:id", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const adminSecret = request.headers["x-admin-secret"]
    if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) return reply.code(403).send({ error: "Yetkisiz" })
    const { id } = request.params
    const { status } = request.body // CONTACTED | COMPLETED | REJECTED
    await prisma.$executeRawUnsafe(
      `UPDATE "UpgradeRequest" SET status = $1, "updatedAt" = NOW() WHERE id = $2`,
      status, id
    )
    return reply.send({ ok: true })
  })

}
export default subscriptionRoutes
