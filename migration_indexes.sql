-- ============================================================
-- Tecrübelerim — Performans Index Migration
-- Çalıştırma: psql $DATABASE_URL -f migration_indexes.sql
-- ============================================================

-- 1. Feed sıralaması için composite index
--    sort=rating ve sort=mostReviewed sorgularını 10x hızlandırır
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_business_feed_rating
  ON "Business" ("isActive", "isDeleted", "averageRating" DESC)
  WHERE "isActive" = true AND "isDeleted" = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_business_feed_reviews
  ON "Business" ("isActive", "isDeleted", "totalReviews" DESC)
  WHERE "isActive" = true AND "isDeleted" = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_business_feed_newest
  ON "Business" ("isActive", "isDeleted", "createdAt" DESC)
  WHERE "isActive" = true AND "isDeleted" = false;

-- 2. Şehir + kategori filtresi — 432k satırda kritik
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_business_city_category
  ON "Business" ("city", "categoryId")
  WHERE "isActive" = true AND "isDeleted" = false;

-- 3. Subscription plan — boosted işletme sorgusu için
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_business_subscription
  ON "Business" ("subscriptionPlan")
  WHERE "isActive" = true AND "isDeleted" = false;

-- 4. Yorum feed'i için — /:id/reviews endpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_review_business_published
  ON "Review" ("businessId", "isPublished", "createdAt" DESC)
  WHERE "isPublished" = true AND "isFlagged" = false;

-- 5. ExternalReview — detay sayfası için
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_external_review_business
  ON "ExternalReview" ("businessId", "isVisible", "publishedAt" DESC)
  WHERE "isVisible" = true;

-- 6. Analytics — şehir + kategori rakip sorgusu
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_business_analytics_competitor
  ON "Business" ("city", "categoryId", "averageRating" DESC)
  WHERE "isDeleted" = false;

-- ── Mevcut indexleri kontrol et ──────────────────────────────────────────────
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'Business' ORDER BY indexname;
