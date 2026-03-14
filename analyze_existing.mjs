import { analyzeSentiment } from "./src/services/sentimentService.js"
import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
await prisma.$connect()

const reviews = await prisma.$queryRawUnsafe(`SELECT id, content, rating FROM "Review" WHERE sentiment IS NULL`)
console.log("Analiz edilecek yorum:", reviews.length)

for (const r of reviews) {
  const result = await analyzeSentiment(r.content, r.rating)
  if (result) {
    await prisma.$executeRawUnsafe(
      `UPDATE "Review" SET "sentiment" = $1, "sentimentScore" = $2, "sentimentKeywords" = $3 WHERE id = $4`,
      result.sentiment, result.score, result.keywords, r.id
    )
    console.log(r.id, "->", result.sentiment, result.score, result.keywords)
  } else {
    console.log(r.id, "-> analiz basarisiz")
  }
}
await prisma.$disconnect()