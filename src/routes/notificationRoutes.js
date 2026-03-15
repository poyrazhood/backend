import prisma from '../lib/prisma.js'
;

;

async function notificationRoutes(fastify) {

  // ─── GET / — Bildirim Listesi ──────────────────────────────────────────────

  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { page = 1, limit = 20, unreadOnly = 'false' } = request.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = Math.min(parseInt(limit), 50);

    const where = {
      userId: request.user.userId,
      ...(unreadOnly === 'true' && { isRead: false }),
    };

    try {
      const [notifications, total, unreadCount] = await Promise.all([
        prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
        prisma.notification.count({ where }),
        prisma.notification.count({ where: { userId: request.user.userId, isRead: false } }),
      ]);

      return reply.code(200).send({
        data: notifications,
        unreadCount,
        pagination: { page: parseInt(page), limit: take, total, totalPages: Math.ceil(total / take) },
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Bildirimler alınamadı.' });
    }
  });

  // ─── GET /unread-count ─────────────────────────────────────────────────────

  fastify.get('/unread-count', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const count = await prisma.notification.count({
        where: { userId: request.user.userId, isRead: false },
      });
      return reply.code(200).send({ count });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Sayı alınamadı.' });
    }
  });

  // ─── PATCH /read-all — Tümünü Okundu Yap ─────────────────────────────────

  fastify.patch('/read-all', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { count } = await prisma.notification.updateMany({
        where: { userId: request.user.userId, isRead: false },
        data: { isRead: true },
      });
      return reply.code(200).send({ message: `${count} bildirim okundu olarak işaretlendi.` });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Bildirimler güncellenemedi.' });
    }
  });

  // ─── PATCH /:id/read — Tekil Okundu ───────────────────────────────────────

  fastify.patch('/:id/read', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const notif = await prisma.notification.findUnique({ where: { id: request.params.id } });
      if (!notif) return reply.code(404).send({ error: 'Bildirim bulunamadı.' });
      if (notif.userId !== request.user.userId) return reply.code(403).send({ error: 'Yetkisiz.' });

      await prisma.notification.update({ where: { id: request.params.id }, data: { isRead: true } });
      return reply.code(200).send({ message: 'Okundu.' });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Bildirim güncellenemedi.' });
    }
  });

  // ─── DELETE /:id — Bildirim Sil ───────────────────────────────────────────

  fastify.delete('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const notif = await prisma.notification.findUnique({ where: { id: request.params.id } });
      if (!notif) return reply.code(404).send({ error: 'Bildirim bulunamadı.' });
      if (notif.userId !== request.user.userId) return reply.code(403).send({ error: 'Yetkisiz.' });

      await prisma.notification.delete({ where: { id: request.params.id } });
      return reply.code(200).send({ message: 'Bildirim silindi.' });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Bildirim silinemedi.' });
    }
  });
}

export default notificationRoutes;
