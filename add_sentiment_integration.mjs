import { readFileSync, writeFileSync } from "fs"
let content = readFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/reviewRoutes.js", "utf8")

// import ekle
content = content.replace(
  `import { recalculateTrustLevel } from '../services/trustService.js'`,
  `import { recalculateTrustLevel } from '../services/trustService.js'
import { analyzeSentiment } from '../services/sentimentService.js'`
)

// Arka planda sentiment analizi
content = content.replace(
  `await recalculateTrustLevel(request.user.userId).catch(() => {})`,
  `await recalculateTrustLevel(request.user.userId).catch(() => {})

        analyzeSentiment(review.content, rating).then(async (result) => {
          if (!result) return
          await prisma.$executeRawUnsafe(
            \`UPDATE "Review" SET "sentiment" = $1, "sentimentScore" = $2, "sentimentKeywords" = $3 WHERE id = $4\`,
            result.sentiment, result.score, result.keywords, review.id
          ).catch(() => {})
        }).catch(() => {})`
)

writeFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/reviewRoutes.js", content, "utf8")
console.log("Sentiment entegrasyonu eklendi!")