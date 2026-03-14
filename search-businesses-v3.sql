-- search-businesses-v3.sql
-- CTE kaldırıldı — HNSW indeksi artık çalışır
--
-- docker cp search-businesses-v3.sql tecrubelerim_postgres:/tmp/search-businesses-v3.sql
-- docker exec tecrubelerim_postgres psql -U tecrubelerim -d tecrubelerim_db -f /tmp/search-businesses-v3.sql

-- Önce eski fonksiyonu sil
DROP FUNCTION IF EXISTS search_businesses(text,vector,text,text,integer,double precision,double precision);

-- İki yardımcı fonksiyon: kategori boost hesabı için
-- (CTE yerine scalar subquery kullanıyoruz)

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
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  best_cat_id TEXT;
BEGIN
  -- En yakın ana kategoriyi önceden bul (scalar, bir kez çalışır)
  SELECT c.id INTO best_cat_id
  FROM "Category" c
  JOIN "CategoryEmbedding" ce ON ce."categoryId" = c.id
  WHERE c."parentId" IS NULL
  ORDER BY ce.embedding <=> query_vector
  LIMIT 1;

  RETURN QUERY
  SELECT
    b.id,
    b.name,
    b.slug,
    b.city,
    b.district,
    b.address,
    c.name        AS category_name,
    c.slug        AS category_slug,
    b."averageRating"::FLOAT  AS average_rating,
    b."totalReviews"::INT     AS total_reviews,
    b.latitude::FLOAT,
    b.longitude::FLOAT,
    b.attributes,

    (1 - (be.embedding <=> query_vector))::FLOAT  AS vec_score,

    GREATEST(
      similarity(b.name,  query_text),
      similarity(b.city,  query_text),
      COALESCE(similarity(b.district, query_text), 0)
    )::FLOAT  AS trgm_score,

    CASE
      WHEN c.id = best_cat_id OR c."parentId" = best_cat_id
      THEN 0.2::FLOAT
      ELSE 0.0::FLOAT
    END  AS category_boost,

    (
      vec_weight * (1 - (be.embedding <=> query_vector)) +
      trgm_weight * GREATEST(
        similarity(b.name,  query_text),
        similarity(b.city,  query_text),
        COALESCE(similarity(b.district, query_text), 0)
      ) +
      CASE
        WHEN c.id = best_cat_id OR c."parentId" = best_cat_id
        THEN 0.2
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

  ORDER BY be.embedding <=> query_vector
  LIMIT p_limit;
END;
$$;
