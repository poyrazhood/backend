SELECT COUNT(*) as embedding_li_konya_kafe
FROM "Business" b
JOIN "Category" c ON c.id = b."categoryId"
JOIN "BusinessEmbedding" be ON be."businessId" = b.id
WHERE c.name ILIKE '%kafe%' 
AND b."isActive" = true
AND b.latitude BETWEEN 36.8 AND 38.8 
AND b.longitude BETWEEN 31.5 AND 33.5;