-- Tecrübelerim — Performans Index Migration

CREATE INDEX IF NOT EXISTS idx_business_feed_rating
  ON "Business" ("isActive", "isDeleted", "averageRating" DESC)
  WHERE "isActive" = true AND "isDeleted" = false;

CREATE INDEX IF NOT EXISTS idx_business_feed_reviews
  ON "Business" ("isActive", "isDeleted", "totalReviews" DESC)
  WHERE "isActive" = true AND "isDeleted" = false;

CREATE INDEX IF NOT EXISTS idx_business_feed_newest
  ON "Business" ("isActive", "isDeleted", "createdAt" DESC)
  WHERE "isActive" = true AND "isDeleted" = false;

CREATE INDEX IF NOT EXISTS idx_business_city_category
  ON "Business" ("city", "categoryId")
  WHERE "isActive" = true AND "isDeleted" = false;

CREATE INDEX IF NOT EXISTS idx_business_subscription
  ON "Business" ("subscriptionPlan")
  WHERE "isActive" = true AND "isDeleted" = false;

CREATE INDEX IF NOT EXISTS idx_review_business_published
  ON "Review" ("businessId", "isPublished", "createdAt" DESC)
  WHERE "isPublished" = true AND "isFlagged" = false;

CREATE INDEX IF NOT EXISTS idx_external_review_business
  ON "ExternalReview" ("businessId", "isVisible", "publishedAt" DESC)
  WHERE "isVisible" = true;

CREATE INDEX IF NOT EXISTS idx_business_analytics_competitor
  ON "Business" ("city", "categoryId", "averageRating" DESC)
  WHERE "isDeleted" = false;
