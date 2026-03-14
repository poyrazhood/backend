CREATE TYPE "BusinessBadgeType" AS ENUM ('VERIFIED', 'NEIGHBORHOOD_FAVORITE', 'FEATURED', 'PREMIUM', 'TOP_RATED', 'HIGHLY_REVIEWED', 'NEW_BUSINESS', 'TRUSTED');

CREATE TABLE "BusinessBadge" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "type" "BusinessBadgeType" NOT NULL,
  "awardedBy" TEXT,
  "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "BusinessBadge_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "BusinessBadge" ADD CONSTRAINT "BusinessBadge_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "BusinessBadge_businessId_type_key" ON "BusinessBadge"("businessId", "type");
CREATE INDEX "BusinessBadge_businessId_idx" ON "BusinessBadge"("businessId");
CREATE INDEX "BusinessBadge_type_idx" ON "BusinessBadge"("type");