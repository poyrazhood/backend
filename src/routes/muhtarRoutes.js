import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()

async function muhtarRoutes(fastify, options) {

  // POST /api/muhtar/apply — Basvuru olustur
  fastify.post("/apply", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { neighborhood, district, city, reason } = request.body
    if (!neighborhood || !district || !city || !reason) {
      return reply.code(400).send({ error: "Tum alanlar zorunlu" })
    }
    const existing = await prisma.muhtarApplication.findFirst({
      where: { userId, status: { in: ["PENDING", "APPROVED"] } }
    })
    if (existing) return reply.code(400).send({ error: "Zaten aktif bir basvurunuz var" })
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { totalReviews: true, trustScore: true } })
    if (user.totalReviews < 5) return reply.code(400).send({ error: "En az 5 yorum yazmaniz gerekiyor" })
    const app = await prisma.muhtarApplication.create({
      data: { id: crypto.randomUUID(), userId, neighborhood, district, city, reason }
    })
    return reply.send({ ok: true, application: app })
  })

  // GET /api/muhtar/my — Kendi basvurularim
  fastify.get("/my", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const apps = await prisma.muhtarApplication.findMany({
      where: { userId: request.user.id },
      orderBy: { createdAt: "desc" }
    })
    return reply.send(apps)
  })

  // GET /api/muhtar/admin/list — Admin: tum basvurular
  fastify.get("/admin/list", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== "ADMIN") return reply.code(403).send({ error: "Yetkisiz" })
    const { status = "PENDING", page = 1 } = request.query
    const take = 20
    const skip = (Number(page) - 1) * take
    const [apps, total] = await Promise.all([
      prisma.muhtarApplication.findMany({
        where: { status },
        include: { user: { select: { id: true, username: true, fullName: true, totalReviews: true, trustScore: true, trustLevel: true } } },
        orderBy: { createdAt: "desc" },
        take, skip
      }),
      prisma.muhtarApplication.count({ where: { status } })
    ])
    return reply.send({ apps, total, page: Number(page), totalPages: Math.ceil(total / take) })
  })

  // PATCH /api/muhtar/admin/:id — Admin: onayla/reddet
  fastify.patch("/admin/:id", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== "ADMIN") return reply.code(403).send({ error: "Yetkisiz" })
    const { id } = request.params
    const { action, adminNote } = request.body // action: APPROVED | REJECTED
    if (!["APPROVED", "REJECTED"].includes(action)) return reply.code(400).send({ error: "Gecersiz aksiyon" })
    const app = await prisma.muhtarApplication.update({
      where: { id },
      data: { status: action, adminNote: adminNote || null, reviewedBy: request.user.id, updatedAt: new Date() }
    })
    if (action === "APPROVED") {
      await prisma.user.update({
        where: { id: app.userId },
        data: { trustLevel: "MUHTAR", trustScore: { increment: 50 } }
      })
    }
    return reply.send({ ok: true, app })
  })

}

export default muhtarRoutes