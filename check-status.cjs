'use strict'
require('dotenv').config({ path: require('path').join(__dirname, '.env') })
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

;(async () => {
  const state = await prisma.$queryRawUnsafe(
    `SELECT pipeline, status, "lastProcessed", remaining, "speedPerSec", "currentRunId", "updatedAt"
     FROM "PipelineState" WHERE pipeline = 'enrich'`
  )
  console.log('\n=== PipelineState ===')
  console.table(state)

  const runs = await prisma.$queryRawUnsafe(
    `SELECT id, status, processed, remaining, "startedAt", "finishedAt", message
     FROM "PipelineRun" WHERE pipeline = 'enrich'
     ORDER BY "startedAt" DESC LIMIT 5`
  )
  console.log('\n=== Son 5 PipelineRun ===')
  console.table(runs)

  const tiers = await prisma.$queryRawUnsafe(`
    SELECT
      COUNT(*) FILTER (WHERE "totalReviews" >= 10)                AS t1_all,
      COUNT(*) FILTER (WHERE "totalReviews" >= 3 AND "totalReviews" < 10) AS t2_all,
      COUNT(*) FILTER (WHERE "totalReviews" < 3)                  AS t3_all,
      COUNT(*) FILTER (WHERE "totalReviews" >= 10  AND attributes::jsonb->'ai'->>'processedAt' IS NOT NULL) AS t1_done,
      COUNT(*) FILTER (WHERE "totalReviews" >= 3 AND "totalReviews" < 10 AND attributes::jsonb->'ai'->>'processedAt' IS NOT NULL) AS t2_done,
      COUNT(*) FILTER (WHERE "totalReviews" < 3   AND attributes::jsonb->'ai'->>'processedAt' IS NOT NULL) AS t3_done
    FROM "Business" WHERE "isActive" = true AND "isDeleted" = false
  `)
  console.log('\n=== Tier Dağılımı (Business tablosu) ===')
  console.table(tiers)

  await prisma.$disconnect()
})()
