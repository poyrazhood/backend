import prisma from '../lib/prisma.js'
import { createClient } from 'redis'

// Mock SMS - gercek entegrasyon icin Twilio/Netgsm buraya
async function sendSMS(phone, code) {
  console.log(`[MOCK SMS] ${phone} -> Dogrulama kodunuz: ${code}`)
  return true
}

// Telefonu E.164 formatina normalize et
function normalizePhone(phone) {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('90') && digits.length === 12) return '+' + digits
  if (digits.startsWith('0') && digits.length === 11) return '+9' + digits
  if (digits.length === 10) return '+90' + digits
  return '+' + digits
}

// 6 haneli OTP uret
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// Verification seviyesine gore TrustScore bonusu
const VERIFICATION_BONUS = {
  VERIFIED_SMS: 15,
  VERIFIED_ADDRESS: 20,
  VERIFIED_EMAIL: 8,
  VERIFIED_GOOGLE: 5,
}

async function verificationRoutes(fastify) {

  // POST /api/verification/sms/send
  fastify.post('/sms/send', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { businessId, phone } = request.body || {}
    if (!businessId || !phone) return reply.code(400).send({ error: 'businessId ve phone zorunlu.' })

    const business = await prisma.business.findFirst({ where: { id: businessId, ownerId: request.user.userId } })
    if (!business) return reply.code(403).send({ error: 'Yetkisiz.' })

    // Zaten dogrulanmis mi?
    const existing = await prisma.$queryRawUnsafe(
      `SELECT id FROM "BusinessBadge" WHERE "businessId" = $1 AND type = 'VERIFIED_SMS'`,
      businessId
    )
    if (existing.length > 0) return reply.code(400).send({ error: 'Bu isletme zaten SMS ile dogrulanmis.' })

    // Rate limit - son 10 dk icinde max 3 istek
    const recentRequests = await prisma.$queryRawUnsafe(
      `SELECT id FROM "VerificationRequest" WHERE "businessId" = $1 AND type = 'sms' AND "createdAt" > NOW() - INTERVAL '10 minutes'`,
      businessId
    )
    if (recentRequests.length >= 3) return reply.code(429).send({ error: 'Cok fazla istek. 10 dakika bekleyin.' })

    const normalizedPhone = normalizePhone(phone)
    const code = generateOTP()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 dk

    // Onceki pending istekleri iptal et
    await prisma.$executeRawUnsafe(
      `UPDATE "VerificationRequest" SET status = 'expired' WHERE "businessId" = $1 AND type = 'sms' AND status = 'pending'`,
      businessId
    )

    // Yeni istek olustur
    await prisma.$executeRawUnsafe(
      `INSERT INTO "VerificationRequest" ("id", "businessId", "type", "code", "phone", "expiresAt", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, 'sms', $2, $3, $4, NOW())`,
      businessId, code, normalizedPhone, expiresAt
    )

    await sendSMS(normalizedPhone, code)
    return reply.send({ ok: true, message: `Kod ${normalizedPhone} numarasina gonderildi.`, expiresAt })
  })

  // POST /api/verification/sms/verify
  fastify.post('/sms/verify', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { businessId, code } = request.body || {}
    if (!businessId || !code) return reply.code(400).send({ error: 'businessId ve code zorunlu.' })

    const business = await prisma.business.findFirst({ where: { id: businessId, ownerId: request.user.userId } })
    if (!business) return reply.code(403).send({ error: 'Yetkisiz.' })

    const requests = await prisma.$queryRawUnsafe(
      `SELECT * FROM "VerificationRequest" WHERE "businessId" = $1 AND type = 'sms' AND status = 'pending' ORDER BY "createdAt" DESC LIMIT 1`,
      businessId
    )
    const req = requests[0]
    if (!req) return reply.code(400).send({ error: 'Aktif dogrulama istegi bulunamadi.' })
    if (new Date(req.expiresAt) < new Date()) {
      await prisma.$executeRawUnsafe(`UPDATE "VerificationRequest" SET status = 'expired' WHERE id = $1`, req.id)
      return reply.code(400).send({ error: 'Kod suresi dolmus. Yeniden gonderin.' })
    }

    // Max 5 deneme
    if (req.attempts >= 5) return reply.code(400).send({ error: 'Cok fazla yanlis deneme. Yeniden gonderin.' })

    if (req.code !== code) {
      await prisma.$executeRawUnsafe(`UPDATE "VerificationRequest" SET attempts = attempts + 1, "updatedAt" = NOW() WHERE id = $1`, req.id)
      return reply.code(400).send({ error: 'Yanlis kod.', remaining: 5 - req.attempts - 1 })
    }

    // Dogrulama basarili
    await prisma.$executeRawUnsafe(`UPDATE "VerificationRequest" SET status = 'verified', "updatedAt" = NOW() WHERE id = $1`, req.id)

    // Badge ekle
    await prisma.$executeRawUnsafe(
      `INSERT INTO "BusinessBadge" ("id", "businessId", type, "awardedAt")
       VALUES (gen_random_uuid()::text, $1, 'VERIFIED_SMS', NOW())
       ON CONFLICT DO NOTHING`,
      businessId
    )

    // verificationLevel ve verifiedPhone guncelle
    await prisma.$executeRawUnsafe(
      `UPDATE "Business" SET "verificationLevel" = GREATEST("verificationLevel", 3), "verifiedPhone" = $1, "isVerified" = true, "verifiedAt" = NOW(), "updatedAt" = NOW() WHERE id = $2`,
      req.phone, businessId
    )

    return reply.send({ ok: true, badge: 'VERIFIED_SMS', message: 'SMS dogrulamasi basarili! +15 TrustScore bonusu kazandiniz.' })
  })

  // POST /api/verification/address/submit
  fastify.post('/address/submit', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { businessId, documentUrl, notes } = request.body || {}
    if (!businessId || !documentUrl) return reply.code(400).send({ error: 'businessId ve documentUrl zorunlu.' })

    const business = await prisma.business.findFirst({ where: { id: businessId, ownerId: request.user.userId } })
    if (!business) return reply.code(403).send({ error: 'Yetkisiz.' })

    // Onceki pending adres istegini iptal et
    await prisma.$executeRawUnsafe(
      `UPDATE "VerificationRequest" SET status = 'expired' WHERE "businessId" = $1 AND type = 'address' AND status = 'pending'`,
      businessId
    )

    await prisma.$executeRawUnsafe(
      `INSERT INTO "VerificationRequest" ("id", "businessId", "type", "documentUrl", "status", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, 'address', $2, 'pending', NOW())`,
      businessId, documentUrl
    )

    return reply.send({ ok: true, message: 'Belgeniz incelemeye alindi. 1-3 is gunu icinde sonuclaniyor.' })
  })

  // GET /api/verification/:businessId/status
  fastify.get('/:businessId/status', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { businessId } = request.params
    const business = await prisma.business.findFirst({
      where: { id: businessId, ownerId: request.user.userId },
      select: { verificationLevel: true, verifiedPhone: true, isVerified: true }
    })
    if (!business) return reply.code(403).send({ error: 'Yetkisiz.' })

    const badges = await prisma.$queryRawUnsafe(
      `SELECT type::text, "awardedAt" FROM "BusinessBadge" WHERE "businessId" = $1 AND type::text LIKE 'VERIFIED_%'`,
      businessId
    )
    const pendingAddress = await prisma.$queryRawUnsafe(
      `SELECT id, "createdAt" FROM "VerificationRequest" WHERE "businessId" = $1 AND type = 'address' AND status = 'pending' LIMIT 1`,
      businessId
    )

    return reply.send({
      verificationLevel: business.verificationLevel,
      isVerified: business.isVerified,
      verifiedPhone: business.verifiedPhone ? business.verifiedPhone.replace(/(.{3}).*(.{2})$/, '$1*****$2') : null,
      badges,
      pendingAddressReview: pendingAddress.length > 0
    })
  })

  // ADMIN: POST /api/verification/address/:requestId/approve
  fastify.post('/address/:requestId/approve', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { requestId } = request.params
    const { approved, adminNote } = request.body || {}

    // Admin kontrolu
    const user = await prisma.user.findUnique({ where: { id: request.user.userId }, select: { role: true } })
    if (user?.role !== 'ADMIN') return reply.code(403).send({ error: 'Sadece adminler.' })

    const req = await prisma.$queryRawUnsafe(
      `SELECT * FROM "VerificationRequest" WHERE id = $1 AND type = 'address'`,
      requestId
    ).then(r => r[0])
    if (!req) return reply.code(404).send({ error: 'Istek bulunamadi.' })

    if (approved) {
      await prisma.$executeRawUnsafe(
        `UPDATE "VerificationRequest" SET status = 'verified', "adminNote" = $1, "updatedAt" = NOW() WHERE id = $2`,
        adminNote || null, requestId
      )
      await prisma.$executeRawUnsafe(
        `INSERT INTO "BusinessBadge" ("id", "businessId", type, "awardedAt")
         VALUES (gen_random_uuid()::text, $1, 'VERIFIED_ADDRESS', NOW()) ON CONFLICT DO NOTHING`,
        req.businessId
      )
      await prisma.$executeRawUnsafe(
        `UPDATE "Business" SET "verificationLevel" = GREATEST("verificationLevel", 4), "isVerified" = true, "verifiedAt" = NOW(), "updatedAt" = NOW() WHERE id = $1`,
        req.businessId
      )
      return reply.send({ ok: true, message: 'Adres dogrulamasi onaylandi. +20 TrustScore bonusu verildi.' })
    } else {
      await prisma.$executeRawUnsafe(
        `UPDATE "VerificationRequest" SET status = 'rejected', "adminNote" = $1, "updatedAt" = NOW() WHERE id = $2`,
        adminNote || 'Reddedildi.', requestId
      )
      return reply.send({ ok: true, message: 'Adres dogrulamasi reddedildi.' })
    }
  })
}

export default verificationRoutes
