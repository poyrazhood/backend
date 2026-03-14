import { PrismaClient } from '@prisma/client';
import { getUserProfile } from '../services/userService.js';

const prisma = new PrismaClient();

async function userRoutes(fastify) {

  // ─── GET /me ── Kendi Profil Verisi ─────────────────────────────────────────

  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: request.user.userId },
        select: {
          id: true, username: true, email: true, fullName: true,
          avatarUrl: true, bio: true, phoneNumber: true,
          trustScore: true, trustLevel: true, badgeLevel: true,
          totalReviews: true, helpfulVotes: true, verifiedReviews: true,
          emailVerified: true, phoneVerified: true,
          followersCount: true, followingCount: true,
          profileViews: true, createdAt: true, lastLoginAt: true,
        },
      });

      if (!user) return reply.code(404).send({ error: 'Kullanıcı bulunamadı.' });

      return reply.code(200).send({
        user: {
          ...user,
          stats: {
            helpfulPercentage: user.totalReviews > 0
              ? ((user.helpfulVotes / user.totalReviews) * 100).toFixed(1)
              : '0.0',
            isVerified: user.emailVerified || user.phoneVerified,
          },
        },
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Profil alınamadı.' });
    }
  });

  // ─── GET /me/saved ── Kaydedilen İşletmeler ─────────────────────────────────

  fastify.get('/me/saved', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { page = 1, limit = 20 } = request.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = Math.min(parseInt(limit), 50);

    try {
      const [saves, total] = await Promise.all([
        prisma.savedBusiness.findMany({
          where: { userId: request.user.userId },
          skip,
          take,
          orderBy: { createdAt: 'desc' },
          include: {
            business: {
              include: {
                category: { select: { id: true, name: true, slug: true, icon: true } },
              },
            },
          },
        }),
        prisma.savedBusiness.count({ where: { userId: request.user.userId } }),
      ]);

      return reply.code(200).send({
        data: saves.map(s => s.business),
        pagination: {
          page: parseInt(page),
          limit: take,
          total,
          totalPages: Math.ceil(total / take),
        },
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Kaydedilenler alınamadı.' });
    }
  });

  // ─── PATCH /me ── Profil Düzenle ─────────────────────────────────────────────

  fastify.patch('/me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { fullName, avatarUrl, phoneNumber, bio } = request.body || {};

    try {
      const updated = await prisma.user.update({
        where: { id: request.user.userId },
        data: {
          ...(fullName    !== undefined && { fullName }),
          ...(avatarUrl   !== undefined && { avatarUrl }),
          ...(phoneNumber !== undefined && { phoneNumber }),
          ...(bio         !== undefined && { bio }),
        },
        select: {
          id: true, username: true, fullName: true, avatarUrl: true,
          bio: true, phoneNumber: true,
          trustScore: true, trustLevel: true, badgeLevel: true,
        },
      });

      return reply.code(200).send({ user: updated });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Profil güncellenemedi.' });
    }
  });

  // ─── GET /leaderboard/muhtarlar ──────────────────────────────────────────────
  // --- GET /me/businesses ---
  fastify.get('/me/businesses', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const businesses = await prisma.business.findMany({
        where: { ownerId: request.user.userId, isDeleted: false },
        select: {
          id: true, name: true, slug: true, city: true, district: true,
          claimStatus: true, isVerified: true, averageRating: true, totalReviews: true,
          attributes: true, category: { select: { name: true, icon: true, slug: true } },
          photos: { select: { url: true }, take: 1 }
        },
        orderBy: { createdAt: 'desc' }
      })
      return reply.code(200).send({ businesses })
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: 'Isletmeler alinamadi.' })
    }
  })

  // (/:username'den ÖNCE tanımlanmalı)

  fastify.get('/leaderboard/muhtarlar', async (request, reply) => {
    const { city, limit = 10 } = request.query;

    try {
      const users = await prisma.user.findMany({
        where: {
          badgeLevel: { in: ['GOLD', 'PLATINUM'] },
          isActive: true, isBanned: false,
          ...(city && {
            reviews: { some: { business: { city: { contains: city, mode: 'insensitive' } } } },
          }),
        },
        select: {
          id: true, username: true, fullName: true, avatarUrl: true,
          trustScore: true, trustLevel: true, badgeLevel: true,
          totalReviews: true, helpfulVotes: true, followersCount: true,
        },
        orderBy: [{ trustScore: 'desc' }, { helpfulVotes: 'desc' }],
        take: Math.min(parseInt(limit), 50),
      });

      return reply.code(200).send({ data: users });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Leaderboard alınamadı.' });
    }
  });

  // ─── GET /:username ── Kullanıcı Profili ────────────────────────────────────

  fastify.get('/:username', { preHandler: [fastify.optionalAuth] }, async (request, reply) => {
    const { username } = request.params;

    try {
      const user = await prisma.user.findUnique({
        where: { username },
        select: {
          id: true, username: true, fullName: true, avatarUrl: true,
          trustScore: true, trustLevel: true, badgeLevel: true,
          totalReviews: true, helpfulVotes: true, verifiedReviews: true,
          followersCount: true, followingCount: true,
          emailVerified: true, phoneVerified: true, createdAt: true,
          reviews: {
            where: { isPublished: true, isFlagged: false },
            orderBy: { createdAt: 'desc' },
            take: 10,
            include: {
              business: {
                select: {
                  id: true, name: true, slug: true,
                  category: { select: { name: true, icon: true } },
                },
              },
              photos: true,
            },
          },
        },
      });

      if (!user) return reply.code(404).send({ error: 'Kullanıcı bulunamadı.' });

      let isFollowing = false;
      if (request.user && request.user.userId !== user.id) {
        const follow = await prisma.userFollow.findUnique({
          where: { followerId_followingId: { followerId: request.user.userId, followingId: user.id } },
        });
        isFollowing = !!follow;
      }

      prisma.user.update({ where: { id: user.id }, data: { profileViews: { increment: 1 } } }).catch(() => {});

      return reply.code(200).send({
        ...user,
        isFollowing,
        stats: {
          helpfulPercentage: user.totalReviews > 0
            ? ((user.helpfulVotes / user.totalReviews) * 100).toFixed(1)
            : '0.0',
          isVerified: user.emailVerified || user.phoneVerified,
        },
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Profil alınamadı.' });
    }
  });

  // ─── PATCH /me ── already defined above ─────────────────────────────────────

  // ─── POST /:username/follow ── Takip Et / Çık ───────────────────────────────

  fastify.post('/:username/follow', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { username } = request.params;

    try {
      const target = await prisma.user.findUnique({
        where: { username },
        select: { id: true, username: true, fullName: true },
      });
      if (!target) return reply.code(404).send({ error: 'Kullanıcı bulunamadı.' });
      if (target.id === request.user.userId) {
        return reply.code(400).send({ error: 'Kendinizi takip edemezsiniz.' });
      }

      const existing = await prisma.userFollow.findUnique({
        where: { followerId_followingId: { followerId: request.user.userId, followingId: target.id } },
      });

      if (existing) {
        await prisma.$transaction([
          prisma.userFollow.delete({ where: { id: existing.id } }),
          prisma.user.update({ where: { id: request.user.userId }, data: { followingCount: { decrement: 1 } } }),
          prisma.user.update({ where: { id: target.id }, data: { followersCount: { decrement: 1 } } }),
        ]);
        return reply.code(200).send({ following: false, message: 'Takipten çıkıldı.' });
      }

      await prisma.$transaction([
        prisma.userFollow.create({ data: { followerId: request.user.userId, followingId: target.id } }),
        prisma.user.update({ where: { id: request.user.userId }, data: { followingCount: { increment: 1 } } }),
        prisma.user.update({ where: { id: target.id }, data: { followersCount: { increment: 1 } } }),
      ]);

      await prisma.notification.create({
        data: {
          userId: target.id,
          type: 'NEW_FOLLOWER',
          title: 'Yeni takipçin var!',
          content: `${request.user.username} sizi takip etmeye başladı.`,
          metadata: { userId: request.user.userId },
        },
      }).catch(() => {});

      return reply.code(200).send({ following: true, message: 'Takip edildi.' });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Takip işlemi başarısız.' });
    }
  });

  // ─── GET /:username/followers ── Takipçiler ─────────────────────────────────

  fastify.get('/:username/followers', async (request, reply) => {
    const { username } = request.params;
    const { page = 1, limit = 20 } = request.query;

    try {
      const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
      if (!user) return reply.code(404).send({ error: 'Kullanıcı bulunamadı.' });

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const take = Math.min(parseInt(limit), 50);

      const [follows, total] = await Promise.all([
        prisma.userFollow.findMany({
          where: { followingId: user.id },
          skip, take,
          orderBy: { createdAt: 'desc' },
          include: {
            follower: {
              select: {
                id: true, username: true, fullName: true, avatarUrl: true,
                trustScore: true, trustLevel: true, badgeLevel: true, totalReviews: true,
              },
            },
          },
        }),
        prisma.userFollow.count({ where: { followingId: user.id } }),
      ]);

      return reply.code(200).send({
        data: follows.map(f => f.follower),
        pagination: { page: parseInt(page), limit: take, total, totalPages: Math.ceil(total / take) },
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Takipçiler alınamadı.' });
    }
  });

  // GET /api/users/me/export — Veri disa aktar
  fastify.get('/me/export', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const [user, reviews, savedBusinesses] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, username: true, fullName: true, createdAt: true, trustScore: true, trustLevel: true }
      }),
      prisma.review.findMany({
        where: { userId },
        select: { id: true, rating: true, content: true, createdAt: true, business: { select: { name: true, slug: true } } }
      }),
      prisma.savedBusiness.findMany({
        where: { userId },
        select: { business: { select: { name: true, slug: true } }, createdAt: true }
      })
    ])
    return reply.send({ exportedAt: new Date(), user, reviews, savedBusinesses })
  })

  // DELETE /api/users/me — Hesap sil (anonimize et)
  fastify.delete('/me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const anonEmail = `deleted_${userId}@tecrubelerim.com`
    await prisma.$transaction([
      // Kullanici bilgilerini anonimize et
      prisma.user.update({
        where: { id: userId },
        data: {
          email: anonEmail,
          username: `silindi_${userId.slice(-8)}`,
          fullName: 'Silinmis Kullanici',
          avatarUrl: null,
          isBanned: true,
          banReason: 'Hesap kullanici tarafindan silindi'
        }
      }),
      // Bildirimleri sil
      prisma.notification.deleteMany({ where: { userId } }),
      // Kaydedilen isletmeleri sil
      prisma.savedBusiness.deleteMany({ where: { userId } }),
    ])
    return reply.send({ ok: true })
  })

  // ─── GET / — Kullanıcı Listesi ───────────────────────────────────────────────
  fastify.get('/', async (request, reply) => {
    const { sort = 'trustScore', limit = 20, search = '' } = request.query
    const take = Math.min(parseInt(limit), 50)
    const where = search ? {
      OR: [
        { username: { contains: search, mode: 'insensitive' } },
        { fullName: { contains: search, mode: 'insensitive' } },
      ]
    } : {}
    const orderBy = sort === 'trustScore' ? [{ trustScore: 'desc' }] :
                    sort === 'reviews' ? [{ totalReviews: 'desc' }] :
                    [{ createdAt: 'desc' }]
    const users = await prisma.user.findMany({
      where: { ...where, isBanned: false },
      orderBy,
      take,
      select: {
        id: true, username: true, fullName: true, avatarUrl: true,
        trustScore: true, trustLevel: true, badgeLevel: true, totalReviews: true,
        createdAt: true,
      }
    })
    return reply.send({ data: users, total: users.length })
  })
}
export default userRoutes