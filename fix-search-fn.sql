CREATE OR REPLACE FUNCTION public.search_businesses(
  query_text text,
  query_vector vector,
  p_city text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_limit integer DEFAULT 20,
  vec_weight double precision DEFAULT 0.6,
  trgm_weight double precision DEFAULT 0.4
)
RETURNS TABLE(
  id text, name text, slug text, city text, district text, address text,
  category_name text, category_slug text,
  average_rating double precision, total_reviews integer,
  latitude double precision, longitude double precision,
  attributes jsonb,
  vec_score double precision, trgm_score double precision,
  category_boost double precision, final_score double precision
)
LANGUAGE sql STABLE AS $$
  SELECT
    b.id, b.name, b.slug, b.city, b.district, b.address,
    c.name AS category_name, c.slug AS category_slug,
    b."averageRating"::double precision, b."totalReviews"::integer,
    b.latitude::double precision, b.longitude::double precision,
    b.attributes,
    (1 - (be.embedding <=> query_vector))::double precision AS vec_score,
    COALESCE(similarity(b.name || ' ' || COALESCE(b.description,''), query_text), 0)::double precision AS trgm_score,
    CASE WHEN LOWER(c.name) LIKE '%' || LOWER(query_text) || '%' THEN 0.2 ELSE 0.0 END::double precision AS category_boost,
    (
      vec_weight * (1 - (be.embedding <=> query_vector)) +
      trgm_weight * COALESCE(similarity(b.name || ' ' || COALESCE(b.description,''), query_text), 0) +
      CASE WHEN LOWER(c.name) LIKE '%' || LOWER(query_text) || '%' THEN 0.2 ELSE 0.0 END
    )::double precision AS final_score
  FROM "BusinessEmbedding" be
  JOIN "Business" b ON b.id = be."businessId"
  LEFT JOIN "Category" c ON c.id = b."categoryId"
  WHERE b."isActive" = true AND b."isDeleted" = false
    AND (p_city IS NULL OR LOWER(b.city) LIKE '%' || LOWER(p_city) || '%')
    AND (p_category IS NULL OR c.slug = p_category)
  ORDER BY final_score DESC
  LIMIT p_limit
$$;