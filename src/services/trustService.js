import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()

// TrustLevel yukseltme kurallari
const TRUST_RULES = [
  { level: "DEVELOPING",   minReviews: 3,  minScore: 55, minHelpful: 0  },
  { level: "TRUSTED",      minReviews: 10, minScore: 65, minHelpful: 5  },
  { level: "HIGHLY_TRUSTED", minReviews: 25, minScore: 75, minHelpful: 15 },
  { level: "VERIFIED",     minReviews: 50, minScore: 85, minHelpful: 30 },
]

const LEVEL_ORDER = ["NEWCOMER", "DEVELOPING", "TRUSTED", "HIGHLY_TRUSTED", "VERIFIED", "MUHTAR"]

export async function recalculateTrustLevel(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { trustLevel: true, totalReviews: true, trustScore: true, helpfulVotes: true }
  })
  if (!user || user.trustLevel === "MUHTAR") return null

  let newLevel = "NEWCOMER"
  for (const rule of TRUST_RULES) {
    if (user.totalReviews >= rule.minReviews &&
        user.trustScore  >= rule.minScore &&
        user.helpfulVotes >= rule.minHelpful) {
      newLevel = rule.level
    }
  }

  const currentIdx = LEVEL_ORDER.indexOf(user.trustLevel)
  const newIdx     = LEVEL_ORDER.indexOf(newLevel)

  // Sadece yukari yukselt, asagi dusurme
  if (newIdx <= currentIdx) return null

  await prisma.user.update({ where: { id: userId }, data: { trustLevel: newLevel } })
  return newLevel
}

export async function recalculateAllTrustLevels() {
  const users = await prisma.user.findMany({
    where: { trustLevel: { not: "MUHTAR" }, isActive: true },
    select: { id: true }
  })
  let upgraded = 0
  for (const u of users) {
    const result = await recalculateTrustLevel(u.id)
    if (result) upgraded++
  }
  return { total: users.length, upgraded }
}