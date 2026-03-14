CREATE TABLE "SiteConfig" (
  "key"       TEXT NOT NULL,
  "value"     TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SiteConfig_pkey" PRIMARY KEY ("key")
);

INSERT INTO "SiteConfig" ("key", "value") VALUES
  ('privacy_policy', 'Gizlilik politikasi icerigi buraya gelecek.'),
  ('terms_of_service', 'Kullanim kosullari icerigi buraya gelecek.'),
  ('help', 'Yardim icerigi buraya gelecek.');