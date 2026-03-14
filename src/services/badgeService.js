import { prisma } from '../index.js'

const BADGE_RULES = {
  NEIGHBORHOOD_FAVORITE: { minRating: 4.5, minReviews: 20 },
  HIGHLY_REVIEWED:       { minReviews: 100 },
  TOP_RATED:             { topN: 10 },
  NEW_BUSINESS:          { maxAgeDays: 30 },
  TRUSTED:               { minAgeDays: 180, maxReports: 0 },
}

export async function recalculateAutoBadges() {
  const businesses = await prisma.business.findMany({
    where: { isDeleted: false },
    select: {
      id: true,
      createdAt: true,
      averageRating: true,
      totalReviews: true,
      city: true,
    }
  })

  // TOP_RATED: şehir bazında top 10
  const cityGroups = {}
  for (const b of businesses) {
    const key = b.city || 'unknown'
    if (!cityGroups[key]) cityGroups[key] = []
    cityGroups[key].push(b)
  }
  const topRatedIds = new Set()
  for (const city of Object.values(cityGroups)) {
    city
      .sort((a, b) => (b.averageRating ?? 0) - (a.averageRating ?? 0))
      .slice(0, 10)
      .forEach(b => topRatedIds.add(b.id))
  }

  const now = new Date()
  let awarded = 0, revoked = 0

  for (const b of businesses) {
    const ageDays = (now - new Date(b.createdAt)) / 86400000
    const rating  = b.averageRating ?? 0
    const reviews = b.totalReviews  ?? 0

    const shouldHave = {
      NEIGHBORHOOD_FAVORITE: rating >= 4.5 && reviews >= 20,
      HIGHLY_REVIEWED:       reviews >= 100,
      TOP_RATED:             topRatedIds.has(b.id),
      NEW_BUSINESS:          ageDays <= 30,
      TRUSTED:               ageDays >= 180,
    }

    for (const [type, qualify] of Object.entries(shouldHave)) {
      const existing = await prisma.businessBadge.findUnique({
        where: { businessId_type: { businessId: b.id, type } }
      })

      if (qualify && !existing) {
        await prisma.businessBadge.create({
          data: { id: `${b.id}_${type}`, businessId: b.id, type, isActive: true }
        })
        awarded++
      } else if (!qualify && existing?.isActive) {
        await prisma.businessBadge.update({
          where: { businessId_type: { businessId: b.id, type } },
          data: { isActive: false }
        })
        revoked++
      }
    }
  }

  return { processed: businesses.length, awarded, revoked }
}