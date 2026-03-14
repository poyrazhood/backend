import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── TrustScore Aksiyonları ───────────────────────────────────────────────────

const TRUST_ACTIONS = {
  review_published:  { points: 10,  reason: 'Yorum yayınlandı' },
  helpful_vote:      { points: 5,   reason: 'Yorum faydalı bulundu' },
  review_verified:   { points: 15,  reason: 'Yorum doğrulandı' },
  email_verified:    { points: 10,  reason: 'E-posta doğrulandı' },
  phone_verified:    { points: 20,  reason: 'Telefon numarası doğrulandı' },
  review_removed:    { points: -20, reason: 'Yorum kural ihlali nedeniyle kaldırıldı' },
  spam_detected:     { points: -30, reason: 'Spam veya sahte yorum tespit edildi' },
};

// ─── Yardımcı Fonksiyonlar ────────────────────────────────────────────────────

export function calculateTrustLevel(score) {
  if (score >= 350) return 'VERIFIED';
  if (score >= 200) return 'HIGHLY_TRUSTED';
  if (score >= 100) return 'TRUSTED';
  if (score >= 40)  return 'DEVELOPING';
  return 'NEWCOMER';
}

function calculateBadgeFromStats({ totalReviews, helpfulVotes, emailVerified, phoneVerified }) {
  const isVerified = emailVerified || phoneVerified;
  const helpfulPct = totalReviews > 0 ? (helpfulVotes / totalReviews) * 100 : 0;

  if (totalReviews >= 500)                                      return 'PLATINUM';
  if (totalReviews >= 50 && helpfulPct >= 90 && isVerified)     return 'GOLD';
  if (totalReviews >= 20 && helpfulPct >= 80)                   return 'SILVER';
  if (totalReviews >= 5)                                         return 'BRONZE';
  return 'NONE';
}

// ─── updateTrustScore ─────────────────────────────────────────────────────────

/**
 * Kullanıcının trust score'unu günceller, geçmişe kaydeder, gerekirse bildirim gönderir.
 * @param {string} userId
 * @param {string} action - TRUST_ACTIONS anahtarı
 * @param {object} metadata - Ek bilgi (opsiyonel)
 */
export async function updateTrustScore(userId, action, metadata = {}) {
  const config = TRUST_ACTIONS[action];
  if (!config) throw new Error(`Bilinmeyen aksiyon: ${action}`);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { trustScore: true, trustLevel: true },
  });
  if (!user) throw new Error('Kullanıcı bulunamadı');

  const oldScore = user.trustScore;
  const newScore = Math.max(0, Math.min(500, oldScore + config.points));
  const newLevel = calculateTrustLevel(newScore);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { trustScore: newScore, trustLevel: newLevel },
    }),
    prisma.trustScoreHistory.create({
      data: { userId, oldScore, newScore, reason: config.reason, metadata },
    }),
  ]);

  // Seviye atladıysa bildirim oluştur
  if (newLevel !== user.trustLevel) {
    await prisma.notification.create({
      data: {
        userId,
        type: 'TRUST_LEVEL_UP',
        title: '🏆 Yeni seviye!',
        content: `TrustScore seviyeniz ${newLevel} oldu. Tebrikler!`,
        metadata: { oldLevel: user.trustLevel, newLevel, newScore },
      },
    }).catch(() => {});
  }

  return { oldScore, newScore, oldLevel: user.trustLevel, newLevel };
}

// ─── calculateBadgeLevel ─────────────────────────────────────────────────────

/**
 * Kullanıcının rozet seviyesini yeniden hesaplar ve değiştiyse günceller.
 * @param {string} userId
 */
export async function calculateBadgeLevel(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      badgeLevel: true, totalReviews: true,
      helpfulVotes: true, emailVerified: true, phoneVerified: true,
    },
  });
  if (!user) throw new Error('Kullanıcı bulunamadı');

  const newBadge = calculateBadgeFromStats(user);

  if (newBadge !== user.badgeLevel) {
    await prisma.user.update({
      where: { id: userId },
      data: { badgeLevel: newBadge },
    });

    // Rozet değişim bildirimi
    await prisma.notification.create({
      data: {
        userId,
        type: 'BADGE_EARNED',
        title: '🎖 Yeni rozet kazandın!',
        content: `Rozet seviyeniz ${newBadge} oldu.`,
        metadata: { oldBadge: user.badgeLevel, newBadge },
      },
    }).catch(() => {});
  }

  return {
    badgeChanged: newBadge !== user.badgeLevel,
    oldBadge: user.badgeLevel,
    newBadge,
  };
}

// ─── getUserProfile ───────────────────────────────────────────────────────────

/**
 * Kullanıcının tam profil bilgilerini döner.
 * @param {string} userId
 */
export async function getUserProfile(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, username: true, email: true, fullName: true,
      avatarUrl: true, trustScore: true, trustLevel: true,
      badgeLevel: true, totalReviews: true, helpfulVotes: true,
      verifiedReviews: true, emailVerified: true, phoneVerified: true,
      profileViews: true, followersCount: true, followingCount: true,
      createdAt: true, lastLoginAt: true,
    },
  });

  if (!user) throw new Error('Kullanıcı bulunamadı');

  return {
    ...user,
    stats: {
      helpfulPercentage: user.totalReviews > 0
        ? ((user.helpfulVotes / user.totalReviews) * 100).toFixed(1)
        : '0.0',
      isVerified: user.emailVerified || user.phoneVerified,
    },
  };
}
