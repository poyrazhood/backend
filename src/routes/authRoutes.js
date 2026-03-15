import prisma from '../lib/prisma.js'
;
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getUserProfile } from '../services/userService.js';

;

async function authRoutes(fastify) {

  // ─── POST /api/auth/register ───────────────────────────────────────────────

  fastify.post('/register', async (request, reply) => {
    const { email, username, password, fullName } = request.body || {};

    if (!email || !username || !password) {
      return reply.code(400).send({ error: 'Email, kullanıcı adı ve şifre zorunludur.' });
    }
    if (password.length < 6) {
      return reply.code(400).send({ error: 'Şifre en az 6 karakter olmalıdır.' });
    }
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      return reply.code(400).send({ error: 'Kullanıcı adı 3-30 karakter, sadece harf/rakam/_ içerebilir.' });
    }

    try {
      const existing = await prisma.user.findFirst({
        where: { OR: [{ email: email.toLowerCase() }, { username: username.toLowerCase() }] },
      });

      if (existing) {
        const field = existing.email === email.toLowerCase() ? 'E-posta' : 'Kullanıcı adı';
        return reply.code(409).send({ error: `${field} zaten kayıtlı.` });
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

      // Hoş geldin bildirimi
      await prisma.notification.create({
        data: {
          userId: user.id,
          type: 'SYSTEM',
          title: "Tecrübelerim'e Hoş Geldin! 🎉",
          content: 'İlk yorumunu yazarak TrustScore kazanmaya başla.',
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
      return reply.code(500).send({ error: 'Kayıt sırasında sunucu hatası.' });
    }
  });

  // ─── POST /api/auth/login ──────────────────────────────────────────────────

  fastify.post('/login', async (request, reply) => {
    const { identifier, password } = request.body || {};

    if (!identifier || !password) {
      return reply.code(400).send({ error: 'Kullanıcı adı/e-posta ve şifre zorunludur.' });
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
        return reply.code(401).send({ error: 'Kullanıcı adı/e-posta veya şifre hatalı.' });
      }

      if (user.isBanned) {
        return reply.code(403).send({ error: `Hesabınız askıya alındı: ${user.banReason || 'Kural ihlali'}` });
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
      return reply.code(500).send({ error: 'Giriş sırasında sunucu hatası.' });
    }
  });

  // ─── GET /api/auth/me ──────────────────────────────────────────────────────

  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const profile = await getUserProfile(request.user.userId);
      return reply.code(200).send({ user: profile });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Profil alınamadı.' });
    }
  });

  // ─── PATCH /api/auth/password ──────────────────────────────────────────────

  fastify.patch('/password', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { currentPassword, newPassword } = request.body || {};

    if (!currentPassword || !newPassword) {
      return reply.code(400).send({ error: 'Mevcut ve yeni şifre zorunludur.' });
    }
    if (newPassword.length < 6) {
      return reply.code(400).send({ error: 'Yeni şifre en az 6 karakter olmalıdır.' });
    }

    try {
      const user = await prisma.user.findUnique({ where: { id: request.user.userId } });
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) return reply.code(400).send({ error: 'Mevcut şifre hatalı.' });

      await prisma.user.update({
        where: { id: request.user.userId },
        data: { passwordHash: await bcrypt.hash(newPassword, 12) },
      });

      return reply.code(200).send({ message: 'Şifre başarıyla güncellendi.' });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Şifre güncellenemedi.' });
    }
  });
}

export default authRoutes;
