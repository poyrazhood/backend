/**
 * Tecrubelerim.com — Ana Giriş Noktası
 * High-Scale Local Business Discovery Platform
 */

import { fileURLToPath } from 'url'
import path from 'path'
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { PrismaClient } from '@prisma/client';
import { createClient } from 'redis';
import jwt from 'jsonwebtoken';

import authRoutes         from './routes/authRoutes.js';
import businessRoutes     from './routes/businessRoutes.js';
import reviewRoutes       from './routes/reviewRoutes.js';
import userRoutes         from './routes/userRoutes.js';
import searchRoutes       from './routes/searchRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import multipart          from '@fastify/multipart'
import fastifyStatic      from '@fastify/static'
import uploadRoutes       from './routes/uploadRoutes.js'
import adminRoutes        from './routes/adminRoutes.js'
import siteConfigRoutes from './routes/siteConfigRoutes.js'
import muhtarRoutes from './routes/muhtarRoutes.js'
import autoServiceRoutes from './routes/autoServiceRoutes.js'
import verificationRoutes from './routes/verificationRoutes.js'
import subscriptionRoutes from './routes/subscriptionRoutes.js'
import categoryRoutes     from './routes/categoryRoutes.js';

// ─── Clients ─────────────────────────────────────────────────────────────────

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
});

export const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

redis.on('error', (err) => console.warn('⚠ Redis (non-fatal):', err.message));

// ─── Fastify ──────────────────────────────────────────────────────────────────

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'info' : 'warn'),
    transport: process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
});

// ─── CORS ─────────────────────────────────────────────────────────────────────

await fastify.register(cors, {
  origin: (process.env.FRONTEND_URL || 'http://localhost:3000').split(',').map(s => s.trim()),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-secret'],
});

// ─── Auth Decorators ──────────────────────────────────────────────────────────

fastify.decorate('authenticate', async function (request, reply) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: "Yetkilendirme token'ı eksik." });
  }
  try {
    request.user = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
  } catch {
    return reply.code(401).send({ error: 'Geçersiz veya süresi dolmuş token.' });
  }
});

fastify.decorate('optionalAuth', async function (request) {
  try {
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      request.user = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    }
  } catch { /* yoksay */ }
});

fastify.decorate('redis', redis);
// --- Plugins ---
await fastify.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } })
const __dirname2 = path.dirname(fileURLToPath(import.meta.url))
await fastify.register(fastifyStatic, { root: path.join(__dirname2, '../uploads'), prefix: '/uploads/' })

// ─── Routes ───────────────────────────────────────────────────────────────────

fastify.register(authRoutes,         { prefix: '/api/auth' });
fastify.register(businessRoutes,     { prefix: '/api/businesses' });
fastify.register(reviewRoutes,       { prefix: '/api/reviews' });
fastify.register(userRoutes,         { prefix: '/api/users' });
fastify.register(searchRoutes,       { prefix: '/api/search' });
fastify.register(notificationRoutes, { prefix: '/api/notifications' });
fastify.register(categoryRoutes,     { prefix: '/api/categories' });
fastify.register(uploadRoutes,       { prefix: '/api/upload' });
fastify.register(adminRoutes,        { prefix: '/api/admin' });
fastify.register(siteConfigRoutes,   { prefix: '/api/site-config' });
fastify.register(muhtarRoutes,       { prefix: '/api/muhtar' });
fastify.register(subscriptionRoutes, { prefix: '/api/subscriptions' });
fastify.register(autoServiceRoutes,   { prefix: '/api/auto-service' });
fastify.register(verificationRoutes,  { prefix: '/api/verification' });

// ─── Health & Root ────────────────────────────────────────────────────────────

fastify.get('/health', async (request, reply) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        redis: redis.isOpen ? 'connected' : 'disconnected',
      },
    };
  } catch (err) {
    return reply.code(503).send({ status: 'unhealthy', error: err.message });
  }
});

fastify.get('/', async () => ({
  name: 'Tecrübelerim.com API',
  version: '0.1.0',
  status: 'operational',
}));

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

const shutdown = async () => {
  console.log('\n🛑 Kapatılıyor...');
  await fastify.close();
  await prisma.$disconnect();
  if (redis.isOpen) await redis.quit();
  console.log('✓ Tüm bağlantılar kapatıldı.');
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ─── Start ────────────────────────────────────────────────────────────────────

const start = async () => {
  try {
    await redis.connect().catch(() => console.warn('⚠ Redis bağlanamadı, devam ediliyor.'));
    await prisma.$connect();
    console.log('✓ Veritabanı bağlantısı kuruldu');

    const port = parseInt(process.env.PORT || '3001');
    await fastify.listen({ port, host: '0.0.0.0' });

    console.log(`\n🚀 Tecrübelerim API → http://localhost:${port}`);
    console.log(`📦 Ortam: ${process.env.NODE_ENV || 'development'}\n`);
  } catch (err) {
    console.error('Sunucu başlatılamadı:', err);
    process.exit(1);
  }
};

start();
