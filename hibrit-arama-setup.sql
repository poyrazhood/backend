-- ============================================================
-- hibrit-arama-setup.sql
-- tecrubelerim.com — Hibrit Arama Altyapısı
--
-- Çalıştırma:
--   psql -U postgres -d tecrubelerim_db -f hibrit-arama-setup.sql
--
-- Veya pgAdmin / DBeaver'da direkt yapıştır ve çalıştır.
-- ============================================================

-- ── 1. pg_trgm indeksleri ────────────────────────────────────
-- name alanı: "Mall of İst" yazınca "Mall of İstanbul" bulsun
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_business_name_trgm
  ON "Business" USING gin (name gin_trgm_ops);

-- city + district: "Kadıköy" aramasında konum eşleşmesi
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_business_city_trgm
  ON "Business" USING gin (city gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_business_district_trgm
  ON "Business" USING gin (district gin_trgm_ops);

-- ── 2. Hibrit arama fonksiyonu ───────────────────────────────
-- Parametreler:
--   query_text    : kullanıcının arama metni
--   query_vector  : bge-m3 ile üretilmiş embedding (Next.js'ten gelir)
--   p_city        : şehir filtresi (opsiyonel, NULL = tüm şehirler)
--   p_category    : kategori slug filtresi (opsiyonel)
--   p_limit       : kaç sonuç dönecek (default 20)
--   vec_weight    : vektör skoru ağırlığı (default 0.6)
--   trgm_weight   : trgm skoru ağırlığı (default 0.4)

CREATE OR REPLACE FUNCTION search_businesses(
  query_text    TEXT,
  query_vector  vector(1024),
  p_city        TEXT    DEFAULT NULL,
  p_category    TEXT    DEFAULT NULL,
  p_limit       INT     DEFAULT 20,
  vec_weight    FLOAT   DEFAULT 0.6,
  trgm_weight   FLOAT   DEFAULT 0.4
)
RETURNS TABLE (
  id              TEXT,
  name            TEXT,
  slug            TEXT,
  city            TEXT,
  district        TEXT,
  address         TEXT,
  category_name   TEXT,
  category_slug   TEXT,
  average_rating  FLOAT,
  total_reviews   INT,
  latitude        FLOAT,
  longitude       FLOAT,
  attributes      JSONB,
  vec_score       FLOAT,
  trgm_score      FLOAT,
  final_score     FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    b.id,
    b.name,
    b.slug,
    b.city,
    b.district,
    b.address,
    c.name        AS category_name,
    c.slug        AS category_slug,
    b."averageRating"  AS average_rating,
    b."totalReviews"   AS total_reviews,
    b.latitude,
    b.longitude,
    b.attributes,

    -- Vektör skoru: 1 - cosine_distance (0=tamamen farklı, 1=aynı)
    (1 - (be.embedding <=> query_vector))::FLOAT  AS vec_score,

    -- trgm skoru: en yüksek benzerlik (name, city, district arasından)
    GREATEST(
      similarity(b.name,     query_text),
      similarity(b.city,     query_text),
      COALESCE(similarity(b.district, query_text), 0)
    )::FLOAT  AS trgm_score,

    -- Final hibrit skor
    (
      vec_weight  * (1 - (be.embedding <=> query_vector)) +
      trgm_weight * GREATEST(
        similarity(b.name,     query_text),
        similarity(b.city,     query_text),
        COALESCE(similarity(b.district, query_text), 0)
      )
    )::FLOAT  AS final_score

  FROM "Business" b
  JOIN "BusinessEmbedding" be ON be."businessId" = b.id
  JOIN "Category" c           ON c.id = b."categoryId"

  WHERE
    b."isActive"  = true
    AND b."isDeleted" = false

    -- Şehir filtresi (opsiyonel)
    AND (p_city IS NULL OR lower(b.city) = lower(p_city))

    -- Kategori filtresi: alt veya ana kategori slug'ına göre
    AND (
      p_category IS NULL
      OR c.slug = p_category
      OR EXISTS (
        SELECT 1 FROM "Category" parent
        WHERE parent.id = c."parentId"
          AND parent.slug = p_category
      )
    )

    -- Minimum trgm eşiği: tamamen alakasız sonuçları eler
    -- (vektör skoru düşük ama trgm yüksekse yine göster)
    AND (
      (1 - (be.embedding <=> query_vector)) > 0.3
      OR GREATEST(
           similarity(b.name,  query_text),
           similarity(b.city,  query_text),
           COALESCE(similarity(b.district, query_text), 0)
         ) > 0.1
    )

  ORDER BY final_score DESC
  LIMIT p_limit;
$$;

-- ── 3. Fonksiyon testi ───────────────────────────────────────
-- (Gerçek test Next.js'ten yapılacak, bu sadece syntax kontrolü)
-- SELECT id, name, final_score
-- FROM search_businesses(
--   'kadıköy restoran',
--   array_fill(0.0, ARRAY[1024])::vector(1024),  -- dummy vector
--   NULL, NULL, 5
-- );

-- ── 4. Ek indeksler (performans) ─────────────────────────────
-- Aktif + silinmemiş işletme filtresi için
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_business_active
  ON "Business" ("isActive", "isDeleted")
  WHERE "isActive" = true AND "isDeleted" = false;

-- Rating'e göre sıralama için
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_business_rating
  ON "Business" ("averageRating" DESC)
  WHERE "isActive" = true AND "isDeleted" = false;
