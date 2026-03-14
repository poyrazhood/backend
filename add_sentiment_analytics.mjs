import { readFileSync, writeFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/businessRoutes.js", "utf8")
const lines = content.split("\r\n")

const sentimentQuery = `
    // Sentiment ozeti
    const sentimentRows = await prisma.$queryRawUnsafe(
      \`SELECT sentiment, COUNT(*) as count FROM "Review" WHERE "businessId" = $1 AND sentiment IS NOT NULL GROUP BY sentiment\`,
      id
    ).catch(() => [])

    const keywordRows = await prisma.$queryRawUnsafe(
      \`SELECT unnest("sentimentKeywords") as keyword FROM "Review" WHERE "businessId" = $1 AND "sentimentKeywords" IS NOT NULL\`,
      id
    ).catch(() => [])

    const sentimentDist = { pozitif: 0, negatif: 0, notr: 0 }
    for (const row of sentimentRows) sentimentDist[row.sentiment] = parseInt(row.count)

    const keywordCount = {}
    for (const row of keywordRows) {
      const k = row.keyword?.toLowerCase()
      if (k) keywordCount[k] = (keywordCount[k] || 0) + 1
    }
    const topKeywords = Object.entries(keywordCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word, count]) => ({ word, count }))`

// 401. satirdan once (index 400) sentiment query ekle
const before = lines.slice(0, 400)
const after = lines.slice(400)

// competitors satirina sentiment ekle (index 412 = "      ]")
const afterWithSentiment = after.map((line, i) => {
  if (line.trim() === "]") return line
  return line
})

// return icine sentiment ekle
const returnIdx = after.findIndex(l => l.includes("...competitors.map"))
after[returnIdx + 1] = "      ],"
after.splice(returnIdx + 2, 0, "      sentiment: { distribution: sentimentDist, topKeywords }")

const newLines = [...before, ...sentimentQuery.split("\n"), ...after]
writeFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/businessRoutes.js", newLines.join("\r\n"), "utf8")
console.log("Sentiment analytics eklendi!")