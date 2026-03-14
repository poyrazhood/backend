-- search-businesses-v2.sql
-- search_businesses fonksiyonunu kategori boost ile günceller
--
-- Çalıştırma:
--   docker cp search-businesses-v2.sql tecrubelerim_postgres:/tmp/search-businesses-v2.sql
--   docker exec tecrubelerim_postgres psql -U tecrubelerim -d tecrubelerim_db -f /tmp/search-businesses-v2.sql

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
  category_boost  FLOAT,
  final_score     FLOAT
)
LANGUAGE sql STABLE
AS $$
  WITH category_scores AS (
    -- Her ana kategorinin sorgu vektörüne benzerliğini hesapla
    -- En yakın kategori boost alacak
    SELECT
      c.id   AS cat_id,
      c.slug AS cat_slug,
      (1 - (ce.embedding <=> query_vector))::FLOAT AS cat_similarity
    FROM "Category" c
    JOIN "CategoryEmbedding" ce ON ce."categoryId" = c.id
    WHERE c."parentId" IS NULL  -- sadece ana kategoriler
  ),
  best_category AS (
    -- Sorguya en yakın tek ana kategoriyi seç
    SELECT cat_id, cat_slug, cat_similarity
    FROM category_scores
    ORDER BY cat_similarity DESC
    LIMIT 1
  )
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

    -- Vektör skoru
    (1 - (be.embedding <=> query_vector))::FLOAT  AS vec_score,

    -- trgm skoru: name, city, district arasından en yüksek
    GREATEST(
      similarity(b.name,  query_text),
      similarity(b.city,  query_text),
      COALESCE(similarity(b.district, query_text), 0)
    )::FLOAT  AS trgm_score,

    -- Kategori boost:
    -- İşletmenin ana kategorisi sorgunun en yakın kategorisiyle eşleşiyorsa +0.2
    -- Aksi halde 0
    CASE
      WHEN (
        -- İşletme doğrudan en iyi kategorideyse
        c.id = (SELECT cat_id FROM best_category)
        OR
        -- İşletme alt kategorideyse ve ana kategorisi en iyi kategoriyse
        c."parentId" = (SELECT cat_id FROM best_category)
      ) THEN 0.2
      ELSE 0.0
    END::FLOAT  AS category_boost,

    -- Final skor: hibrit + kategori boost
    (
      vec_weight  * (1 - (be.embedding <=> query_vector)) +
      trgm_weight * GREATEST(
        similarity(b.name,  query_text),
        similarity(b.city,  query_text),
        COALESCE(similarity(b.district, query_text), 0)
      ) +
      CASE
        WHEN (
          c.id = (SELECT cat_id FROM best_category)
          OR c."parentId" = (SELECT cat_id FROM best_category)
        ) THEN 0.2
        ELSE 0.0
      END
    )::FLOAT  AS final_score

  FROM "Business" b
  JOIN "BusinessEmbedding" be ON be."businessId" = b.id
  JOIN "Category" c           ON c.id = b."categoryId"

  WHERE
    b."isActive"  = true
    AND b."isDeleted" = false
    AND (p_city IS NULL OR lower(b.city) = lower(p_city))
    AND (
      p_category IS NULL
      OR c.slug = p_category
      OR EXISTS (
        SELECT 1 FROM "Category" parent
        WHERE parent.id = c."parentId" AND parent.slug = p_category
      )
    )
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
