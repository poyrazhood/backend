import { prisma } from '../index.js'

export async function createNotification({ userId, type, title, content, metadata = {} }) {
  try {
    await prisma.notification.create({
      data: {
        id: Math.random().toString(36).slice(2) + Date.now().toString(36),
        userId,
        type,
        title,
        content,
        metadata,
        isRead: false,
      }
    })
  } catch (err) {
    console.warn('Bildirim olusturulamadi:', err.message)
  }
}

// Yorum yapilinca isletme sahibine
export async function notifyNewReview({ business, review, reviewer }) {
  if (!business.ownerId) return
  await createNotification({
    userId: business.ownerId,
    type: 'NEW_REVIEW',
    title: 'Yeni Yorum',
    content: `${reviewer.username} "${business.name}" isletmenize yorum yapti: ${review.rating} yildiz`,
    metadata: { businessId: business.id, businessSlug: business.slug, reviewId: review.id, reviewerId: reviewer.id }
  })
}

// Owner reply gelince yorum yapana
export async function notifyOwnerReply({ review, business }) {
  if (!review.userId) return
  await createNotification({
    userId: review.userId,
    type: 'REVIEW_REPLY',
    title: 'İşletme Yanıtladı',
    content: `"${business.name}" yorumunuza yanıt verdi`,
    metadata: { businessId: business.id, businessSlug: business.slug, reviewId: review.id }
  })
}

// Sahiplik talebi onaylandi/reddedildi
export async function notifyClaimResult({ userId, businessName, approved }) {
  await createNotification({
    userId,
    type: approved ? 'CLAIM_APPROVED' : 'CLAIM_REJECTED',
    title: approved ? 'Sahiplik Talebi Onaylandı' : 'Sahiplik Talebi Reddedildi',
    content: approved
      ? `"${businessName}" işletmesinin sahipliği onaylandı. Sahip panelinizden yönetebilirsiniz.`
      : `"${businessName}" işletmesinin sahiplik talebiniz reddedildi.`,
    metadata: { businessName }
  })
}

// Rozet kazanildi
export async function notifyBadgeAwarded({ userId, badgeType }) {
  const badgeNames = {
    VERIFIED: 'Doğrulanmış İşletme',
    NEIGHBORHOOD_FAVORITE: 'Mahalle Favorisi',
    FEATURED: 'Öne Çıkan',
    PREMIUM: 'Premium',
    TOP_RATED: 'En Yüksek Puanlı',
    HIGHLY_REVIEWED: 'Çok Yorumlanan',
    NEW_BUSINESS: 'Yeni İşletme',
    TRUSTED: 'Güvenilir',
  }
  await createNotification({
    userId,
    type: 'BADGE_AWARDED',
    title: 'Yeni Rozet Kazandınız!',
    content: `İşletmeniz "${badgeNames[badgeType] ?? badgeType}" rozetini kazandı`,
    metadata: { badgeType }
  })
}

// Yoruma begeni geldi
export async function notifyReviewLiked({ review, liker }) {
  if (!review.userId || review.userId === liker.id) return
  await createNotification({
    userId: review.userId,
    type: 'REVIEW_LIKED',
    title: 'Yorumunuz Beğenildi',
    content: `${liker.username} yorumunuzu beğendi`,
    metadata: { reviewId: review.id, likerId: liker.id }
  })
}