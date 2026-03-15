// src/services/fakeReviewShield.js
// Sahte yorum tespiti — TrustScore hesabından önce çalışır

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// ─── Kriter Ağırlıkları ────────────────────────────────────────────────────────
const SHIELD_RULES = {
  highRatingFewReviews: { threshold: 4.9, minReviews: 5,  penalty: 0.6  }, // skoru %60'a indir
  suspiciousSpike:      { days: 7,        maxNewReviews: 20, penalty: 0.7 }, // skoru %70'e indir
  zeroVariance:         { minReviews: 5,  penalty: 0.75 },                   // tüm yorumlar aynı puan
  allMaxRating:         { minReviews: 8,  penalty: 0.8  },                   // hepsi 5 yıldız
}

// ─── Tek işletme için shield kontrolü ────────────────────────────────────────
export async function checkFakeReviews(businessId) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { averageRating: true, totalReviews: true, createdAt: true }
  })
  if (!business) return { isSuspicious: false, penalty: 1.0, reasons: [] }

  const reasons = []
  let penalty = 1.0

  // 1. Yüksek puan + az yorum
  if (
    business.averageRating >= SHIELD_RULES.highRatingFewReviews.threshold &&
    business.totalReviews < SHIELD_RULES.highRatingFewReviews.minReviews
  ) {
    reasons.push('high_rating_few_reviews')
    penalty = Math.min(penalty, SHIELD_RULES.highRatingFewReviews.penalty)
  }

  // 2. Son 7 günde ani yorum artışı
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const recentCount = await prisma.review.count({
    where: { businessId, createdAt: { gte: weekAgo }, isPublished: true }
  })
  if (recentCount > SHIELD_RULES.suspiciousSpike.maxNewReviews) {
    reasons.push('suspicious_spike')
    penalty = Math.min(penalty, SHIELD_RULES.suspiciousSpike.penalty)
  }

  // 3. Sıfır varyans — tüm yorumlar aynı puan
  if (business.totalReviews >= SHIELD_RULES.zeroVariance.minReviews) {
    const ratings = await prisma.review.findMany({
      where: { businessId, isPublished: true },
      select: { rating: true }
    })
    if (ratings.length >= SHIELD_RULES.zeroVariance.minReviews) {
      const unique = new Set(ratings.map(r => r.rating))
      if (unique.size === 1) {
        reasons.push('zero_variance')
        penalty = Math.min(penalty, SHIELD_RULES.zeroVariance.penalty)
      }
    }
  }

  // 4. Tüm yorumlar 5 yıldız (8+ yorum varsa)
  if (
    business.totalReviews >= SHIELD_RULES.allMaxRating.minReviews &&
    business.averageRating === 5.0
  ) {
    reasons.push('all_max_rating')
    penalty = Math.min(penalty, SHIELD_RULES.allMaxRating.penalty)
  }

  const isSuspicious = reasons.length > 0

  // DB'ye yaz
  await prisma.business.update({
    where: { id: businessId },
    data: { isSuspicious }
  })

  return { isSuspicious, penalty, reasons }
}

// ─── Toplu tarama — batch job'dan çağrılır ────────────────────────────────────
export async function runFakeReviewShield() {
  const startTime = Date.now()
  console.log('[FakeShield] Tarama başladı...')

  const businesses = await prisma.business.findMany({
    where: { isActive: true, isDeleted: false },
    select: { id: true }
  })

  let suspicious = 0
  let processed = 0

  // 50'şer işletme batch'lerle işle
  const BATCH = 50
  for (let i = 0; i < businesses.length; i += BATCH) {
    const batch = businesses.slice(i, i + BATCH)
    await Promise.all(batch.map(async (b) => {
      const result = await checkFakeReviews(b.id)
      if (result.isSuspicious) suspicious++
      processed++
    }))

    if (processed % 5000 === 0) {
      console.log(`[FakeShield] ${processed}/${businesses.length} işlendi, ${suspicious} şüpheli`)
    }
  }

  const duration = Math.round((Date.now() - startTime) / 1000)
  console.log(`[FakeShield] Tamamlandı: ${processed} işletme, ${suspicious} şüpheli, ${duration}s`)
  return { processed, suspicious, duration }
}
