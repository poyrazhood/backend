import prisma from '../lib/prisma.js'
;
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getUserProfile } from '../services/userService.js';

;

async function authRoutes(fastify) {

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ POST /api/auth/register Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  fastify.post('/register', async (request, reply) => {
    const { email, username, password, fullName } = request.body || {};

    if (!email || !username || !password) {
      return reply.code(400).send({ error: 'Email, kullanÃ„Â±cÃ„Â± adÃ„Â± ve Ã…Å¸ifre zorunludur.' });
    }
    if (password.length < 6) {
      return reply.code(400).send({ error: 'Ã…Âifre en az 6 karakter olmalÃ„Â±dÃ„Â±r.' });
    }
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      return reply.code(400).send({ error: 'KullanÃ„Â±cÃ„Â± adÃ„Â± 3-30 karakter, sadece harf/rakam/_ iÃƒÂ§erebilir.' });
    }

    try {
      const existing = await prisma.user.findFirst({
        where: { OR: [{ email: email.toLowerCase() }, { username: username.toLowerCase() }] },
      });

      if (existing) {
        const field = existing.email === email.toLowerCase() ? 'E-posta' : 'KullanÃ„Â±cÃ„Â± adÃ„Â±';
        return reply.code(409).send({ error: `${field} zaten kayÃ„Â±tlÃ„Â±.` });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const user = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          username: username.toLowerCase(),
          passwordHash,
          fullName: fullName || null,
        },
      });

      // HoÃ…Å¸ geldin bildirimi
      await prisma.notification.create({
        data: {
          userId: user.id,
          type: 'SYSTEM',
          title: "TecrÃƒÂ¼belerim'e HoÃ…Å¸ Geldin! ÄŸÅ¸Ââ€°",
          content: 'Ã„Â°lk yorumunu yazarak TrustScore kazanmaya baÃ…Å¸la.',
        },
      }).catch(() => {});

      const token = jwt.sign(
        { userId: user.id, username: user.username },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return reply.code(201).send({
        token,
        user: {
          id: user.id, email: user.email, username: user.username,
          fullName: user.fullName, trustScore: user.trustScore,
          trustLevel: user.trustLevel, badgeLevel: user.badgeLevel,
        },
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'KayÃ„Â±t sÃ„Â±rasÃ„Â±nda sunucu hatasÃ„Â±.' });
    }
  });

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ POST /api/auth/login Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  fastify.post('/login', async (request, reply) => {
    const { identifier, password } = request.body || {};

    if (!identifier || !password) {
      return reply.code(400).send({ error: 'KullanÃ„Â±cÃ„Â± adÃ„Â±/e-posta ve Ã…Å¸ifre zorunludur.' });
    }

    try {
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { email: identifier.toLowerCase() },
            { username: identifier.toLowerCase() },
          ],
        },
      });

      if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        return reply.code(401).send({ error: 'KullanÃ„Â±cÃ„Â± adÃ„Â±/e-posta veya Ã…Å¸ifre hatalÃ„Â±.' });
      }

      if (user.isBanned) {
        return reply.code(403).send({ error: `HesabÃ„Â±nÃ„Â±z askÃ„Â±ya alÃ„Â±ndÃ„Â±: ${user.banReason || 'Kural ihlali'}` });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      const token = jwt.sign(
        { userId: user.id, username: user.username },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return reply.code(200).send({
        token,
        user: {
          id: user.id, email: user.email, username: user.username,
          fullName: user.fullName, avatarUrl: user.avatarUrl,
          trustScore: user.trustScore, trustLevel: user.trustLevel,
          badgeLevel: user.badgeLevel, totalReviews: user.totalReviews,
          followersCount: user.followersCount, followingCount: user.followingCount,
        },
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'GiriÃ…Å¸ sÃ„Â±rasÃ„Â±nda sunucu hatasÃ„Â±.' });
    }
  });

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ GET /api/auth/me Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const profile = await getUserProfile(request.user.userId);
      return reply.code(200).send({ user: profile });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Profil alÃ„Â±namadÃ„Â±.' });
    }
  });

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ PATCH /api/auth/password Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  fastify.patch('/password', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { currentPassword, newPassword } = request.body || {};

    if (!currentPassword || !newPassword) {
      return reply.code(400).send({ error: 'Mevcut ve yeni Ã…Å¸ifre zorunludur.' });
    }
    if (newPassword.length < 6) {
      return reply.code(400).send({ error: 'Yeni Ã…Å¸ifre en az 6 karakter olmalÃ„Â±dÃ„Â±r.' });
    }

    try {
      const user = await prisma.user.findUnique({ where: { id: request.user.userId } });
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) return reply.code(400).send({ error: 'Mevcut Ã…Å¸ifre hatalÃ„Â±.' });

      await prisma.user.update({
        where: { id: request.user.userId },
        data: { passwordHash: await bcrypt.hash(newPassword, 12) },
      });

      return reply.code(200).send({ message: 'Ã…Âifre baÃ…Å¸arÃ„Â±yla gÃƒÂ¼ncellendi.' });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Ã…Âifre gÃƒÂ¼ncellenemedi.' });
    }
  });
  // check-username
  fastify.get('/check-username', async (request, reply) => {
    const { username } = request.query || {}
    if (!username || username.length < 3) {
      return reply.code(400).send({ available: false })
    }
    try {
      const existing = await prisma.user.findUnique({
        where: { username: username.toLowerCase() },
        select: { id: true }
      })
      return reply.code(200).send({ available: !existing })
    } catch (err) {
      return reply.code(500).send({ available: false })
    }
  })
}

export default authRoutes;
