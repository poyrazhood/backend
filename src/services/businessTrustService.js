// src/services/businessTrustService.js
// TrustScore v4 — İşletme Güven Skoru Hesaplama Motoru
// Faz 1: Sentiment olmadan (scraper bitmeden)
// Faz 2: Sentiment eklenecek (scraper bitince)

import { PrismaClient } from '@prisma/client'
import { checkFakeReviews } from './fakeReviewShield.js'

const prisma = new PrismaClient()

// ─── Sabitler ─────────────────────────────────────────────────────────────────
const BAYESIAN_C = 4.03   // Global platform ortalaması
const BAYESIAN_M = 30     // Minimum yorum eşiği

const WEIGHTS = {
  review:       0.40,
  sentiment:    0.20,   // Faz 2'de aktif
  verification: 0.15,
  engagement:   0.10,
  history:      0.10,
  depthBonus:   0.05,
}

// ─── Yardımcı: Harf Notu ──────────────────────────────────────────────────────
export function scoreToGrade(score) {
  if (score >= 90) return 'A+'
  if (score >= 80) return 'A'
  if (score >= 70) return 'B'
  if (score >= 60) return 'C'
  if (score >= 50) return 'D'
  return 'F'
}

// ─── 1. Review Skoru (Zaman Ağırlıklı + Bayesian) ────────────────────────────
async function calcReviewScore(businessId, totalReviews, averageRating) {
  if (totalReviews === 0) return 0

  // Bayesian düzeltme — az yorumlu işletmelerin yapay yüksek puanını engelle
  const bayesian = (totalReviews * averageRating + BAYESIAN_M * BAYESIAN_C) /
                   (totalReviews + BAYESIAN_M)

  // Son 12 ayın yorumlarını çek — zaman ağırlığı için
  const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
  const recentReviews = await prisma.review.findMany({
    where: { businessId, isPublished: true, createdAt: { gte: yearAgo } },
    select: { rating: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 200
  })

  let timeWeightedScore = bayesian // Yorum yoksa Bayesian skoru kullan

  if (recentReviews.length > 0) {
    const now = Date.now()
    let weightedSum = 0
    let totalWeight = 0

    for (const review of recentReviews) {
      const ageInDays = (now - new Date(review.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      // Trustpilot benzeri logaritmik azalma — eski yorumlar daha az etkiler
      const weight = 1 / Math.log2(ageInDays + 2)
      weightedSum += review.rating * weight
      totalWeight += weight
    }

    const recentAvg = totalWeight > 0 ? weightedSum / totalWeight : bayesian
    // %70 zaman ağırlıklı + %30 Bayesian karışımı
    timeWeightedScore = recentAvg * 0.7 + bayesian * 0.3
  }

  // 0-100'e normalize et (max puan 5)
  return Math.min(100, (timeWeightedScore / 5) * 100)
}

// ─── 2. Verification Skoru ────────────────────────────────────────────────────
function calcVerificationScore(business) {
  let score = 0

  if (business.isVerified)            score += 30
  if (business.verifiedPhone)         score += 25
  if (business.verifiedEmail)         score += 15
  if (business.website)               score += 10
  if (business.phoneNumber)           score += 10
  if (business.verificationLevel > 0) score += business.verificationLevel * 5

  // İşletme sahibi claim etmişse bonus
  if (business.claimStatus === 'CLAIMED') score += 10

  return Math.min(100, score)
}

// ─── 3. Engagement Skoru ─────────────────────────────────────────────────────
async function calcEngagementScore(businessId, totalViews, totalReviews) {
  // İşletmenin yorumlara verdiği yanıt sayısı
  const responseCount = await prisma.review.count({
    where: { businessId, ownerReply: { not: null } }
  }).catch(() => 0)

  const responseRate = totalReviews > 0
    ? Math.min(100, (responseCount / totalReviews) * 100)
    : 0

  // Görüntülenme skoru — logaritmik ölçek
  const viewScore = totalViews > 0
    ? Math.min(100, (Math.log10(totalViews + 1) / Math.log10(10001)) * 100)
    : 0

  // %60 yanıt oranı + %40 görüntülenme
  return responseRate * 0.6 + viewScore * 0.4
}

// ─── 4. History Skoru ─────────────────────────────────────────────────────────
function calcHistoryScore(createdAt) {
  const ageInDays = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)
  // 2 yıl (730 gün) = tam puan
  return Math.min(100, (ageInDays / 730) * 100)
}

// ─── 5. Derinlik Bonusu ───────────────────────────────────────────────────────
async function calcDepthBonus(businessId) {
  let bonus = 0

  // Yorum başına ortalama karakter sayısı
  const reviews = await prisma.review.findMany({
    where: { businessId, isPublished: true },
    select: { content: true },
    take: 50
  })

  if (reviews.length > 0) {
    const avgLength = reviews.reduce((sum, r) => sum + (r.content?.length || 0), 0) / reviews.length
    if (avgLength > 200) bonus += 0.5
    if (avgLength > 500) bonus += 0.5
  }

  // Fotoğraflı yorum var mı
  const photoCount = await prisma.reviewPhoto.count({
    where: { review: { businessId } }
  }).catch(() => 0)

  if (photoCount > 0)  bonus += 1.0
  if (photoCount > 10) bonus += 1.0

  // İşletme galerisi
  const bizPhotoCount = await prisma.businessPhoto.count({
    where: { businessId }
  }).catch(() => 0)

  if (bizPhotoCount > 3)  bonus += 0.5
  if (bizPhotoCount > 10) bonus += 0.5

  return Math.min(5, bonus) // Max +5 puan bonus
}

// ─── 6. Güncellik Trendi (son 90 gün vs önceki 90 gün) ────────────────────────
async function calcRecentTrend(businessId) {
  const now = Date.now()
  const d90 = new Date(now - 90 * 24 * 60 * 60 * 1000)
  const d180 = new Date(now - 180 * 24 * 60 * 60 * 1000)

  const [recent, previous] = await Promise.all([
    prisma.review.aggregate({
      where: { businessId, isPublished: true, createdAt: { gte: d90 } },
      _avg: { rating: true }, _count: true
    }),
    prisma.review.aggregate({
      where: { businessId, isPublished: true, createdAt: { gte: d180, lt: d90 } },
      _avg: { rating: true }, _count: true
    })
  ])

  const recentAvg   = recent._avg.rating   || 0
  const previousAvg = previous._avg.rating || 0

  if (previousAvg === 0) return 0
  // Pozitif = iyileşme, negatif = kötüleşme (-1 ile +1 arası)
  return Math.max(-1, Math.min(1, (recentAvg - previousAvg) / 5))
}

// ─── ANA FONKSİYON: Tek işletme için v4 hesapla ──────────────────────────────
export async function calculateBusinessTrust(businessId) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true, averageRating: true, totalReviews: true,
      totalViews: true, createdAt: true, isVerified: true,
      verifiedPhone: true, verifiedEmail: true, website: true,
      phoneNumber: true, verificationLevel: true, claimStatus: true,
      isActive: true, isDeleted: true
    }
  })

  if (!business || !business.isActive || business.isDeleted) return null

  // Fake Review Shield — şüpheliyse ceza katsayısı uygula
  const shield = await checkFakeReviews(businessId)
  const penalty = shield.penalty

  // 5 bileşeni paralel hesapla
  const [reviewScore, engagementScore, depthBonus, recentTrend] = await Promise.all([
    calcReviewScore(businessId, business.totalReviews, business.averageRating),
    calcEngagementScore(businessId, business.totalViews, business.totalReviews),
    calcDepthBonus(businessId),
    calcRecentTrend(businessId)
  ])

  const verificationScore = calcVerificationScore(business)
  const historyScore      = calcHistoryScore(business.createdAt)

  // Faz 1: Sentiment skoru yok — ağırlıkları yeniden dağıt
  // Sentiment ağırlığı (%20) review'a eklenir geçici olarak
  const sentimentScore = 0
  const adjustedWeights = {
    review:       WEIGHTS.review + WEIGHTS.sentiment, // 0.60
    verification: WEIGHTS.verification,               // 0.15
    engagement:   WEIGHTS.engagement,                 // 0.10
    history:      WEIGHTS.history,                    // 0.10
    sentiment:    0,
  }

  // Ağırlıklı toplam
  const rawScore =
    reviewScore       * adjustedWeights.review +
    verificationScore * adjustedWeights.verification +
    engagementScore   * adjustedWeights.engagement +
    historyScore      * adjustedWeights.history +
    sentimentScore    * adjustedWeights.sentiment +
    depthBonus

  // Fake Shield cezası uygula
  const finalScore = Math.min(100, Math.max(0, rawScore * penalty))
  const grade = scoreToGrade(finalScore)

  // DB'ye yaz
  await prisma.business.update({
    where: { id: businessId },
    data: {
      trustScore:    parseFloat(finalScore.toFixed(2)),
      trustGrade:    grade,
      trustCalcAt:   new Date(),
      recentTrend:   parseFloat(recentTrend.toFixed(4)),
      isSuspicious:  shield.isSuspicious,
    }
  })

  return {
    businessId,
    trustScore: finalScore,
    trustGrade: grade,
    breakdown: {
      reviewScore:       reviewScore.toFixed(1),
      verificationScore: verificationScore.toFixed(1),
      engagementScore:   engagementScore.toFixed(1),
      historyScore:      historyScore.toFixed(1),
      depthBonus:        depthBonus.toFixed(1),
      recentTrend:       recentTrend.toFixed(3),
    },
    shield: { isSuspicious: shield.isSuspicious, penalty, reasons: shield.reasons }
  }
}

// ─── Normalize: Ham skorları 0-100'e ölçekle ─────────────────────────────────
// En yüksek ham skor 100 kabul edilir, diğerleri orantılı ölçeklenir
export async function normalizeScores() {
  console.log('[Normalize] Başladı...')

  // En yüksek ham skoru bul
  const maxResult = await prisma.business.aggregate({
    where: { isActive: true, isDeleted: false, trustScore: { gt: 0 } },
    _max: { trustScore: true }
  })
  const maxScore = maxResult._max.trustScore
  if (!maxScore || maxScore === 0) {
    console.log('[Normalize] Hesaplanmış skor yok, atlanıyor.')
    return
  }

  console.log(`[Normalize] Max ham skor: ${maxScore.toFixed(2)} — buna göre ölçekleniyor`)

  // Tüm işletmeleri çek
  const businesses = await prisma.business.findMany({
    where: { isActive: true, isDeleted: false, trustScore: { gt: 0 } },
    select: { id: true, trustScore: true }
  })

  // Batch'lerle güncelle
  const BATCH = 100
  for (let i = 0; i < businesses.length; i += BATCH) {
    const batch = businesses.slice(i, i + BATCH)
    await Promise.all(batch.map(async (b) => {
      const normalized = Math.min(100, (b.trustScore / maxScore) * 100)
      const grade = scoreToGrade(normalized)
      await prisma.business.update({
        where: { id: b.id },
        data: {
          trustScore: parseFloat(normalized.toFixed(2)),
          trustGrade: grade
        }
      })
    }))
  }

  console.log(`[Normalize] ${businesses.length} işletme normalize edildi (max: ${maxScore.toFixed(2)} → 100)`)
}

// ─── Percentile hesapla — kategori bazlı ──────────────────────────────────────
export async function updatePercentileRanks() {
  console.log('[Percentile] Hesaplama başladı...')

  // Tüm kategorileri çek
  const categories = await prisma.category.findMany({ select: { id: true, name: true } })

  for (const cat of categories) {
    const businesses = await prisma.business.findMany({
      where: { categoryId: cat.id, isActive: true, isDeleted: false, trustScore: { gt: 0 } },
      select: { id: true, trustScore: true },
      orderBy: { trustScore: 'asc' }
    })

    if (businesses.length === 0) continue

    // Her işletmeye yüzdelik dilim ata
    for (let i = 0; i < businesses.length; i++) {
      const percentile = ((i + 1) / businesses.length) * 100
      await prisma.business.update({
        where: { id: businesses[i].id },
        data: { percentileRank: parseFloat(percentile.toFixed(1)) }
      })
    }
  }

  console.log('[Percentile] Tamamlandı')
}
