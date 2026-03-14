CREATE OR REPLACE FUNCTION search_businesses(
  query_text text,
  query_vector vector(1024),
  p_city text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_limit int DEFAULT 20,
  vec_weight float DEFAULT 0.6,
  trgm_weight float DEFAULT 0.4,
  p_lat float DEFAULT NULL,
  p_lng float DEFAULT NULL,
  p_radius_km float DEFAULT 30
)
RETURNS TABLE (
  id text, name text, slug text, city text, district text, address text,
  category_name text, category_slug text,
  average_rating float, total_reviews int,
  latitude float, longitude float, attributes jsonb,
  vec_score float, trgm_score float, category_boost float, final_score float
)
LANGUAGE sql STABLE AS $$
  SELECT
    b.id, b.name, b.slug, b.city, b.district, b.address,
    c.name AS category_name, c.slug AS category_slug,
    b."averageRating"::float, b."totalReviews"::int,
    b.latitude::float, b.longitude::float,
    b.attributes,
    (1 - (be.embedding <=> query_vector))::float AS vec_score,
    COALESCE(similarity(b.name || ' ' || COALESCE(b.description,''), query_text), 0)::float AS trgm_score,
    CASE WHEN LOWER(c.name) LIKE '%' || LOWER(query_text) || '%' THEN 0.2 ELSE 0.0 END::float AS category_boost,
    (
      vec_weight * (1 - (be.embedding <=> query_vector)) +
      trgm_weight * COALESCE(similarity(b.name || ' ' || COALESCE(b.description,''), query_text), 0) +
      CASE WHEN LOWER(c.name) LIKE '%' || LOWER(query_text) || '%' THEN 0.2 ELSE 0.0 END
    )::float AS final_score
  FROM "BusinessEmbedding" be
  JOIN "Business" b ON b.id = be."businessId"
  LEFT JOIN "Category" c ON c.id = b."categoryId"
  WHERE b."isActive" = true AND b."isDeleted" = false
    AND (p_city IS NULL OR LOWER(b.city) LIKE '%' || LOWER(p_city) || '%')
    AND (p_category IS NULL OR c.slug = p_category)
    AND (
      p_lat IS NULL OR p_lng IS NULL OR (
        b.latitude BETWEEN p_lat - (p_radius_km / 111.0) AND p_lat + (p_radius_km / 111.0)
        AND b.longitude BETWEEN p_lng - (p_radius_km / 85.0) AND p_lng + (p_radius_km / 85.0)
      )
    )
  ORDER BY final_score DESC
  LIMIT p_limit
$$;