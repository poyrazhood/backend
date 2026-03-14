SELECT COUNT(*) as toplam,
  COUNT(CASE WHEN latitude BETWEEN 36.8 AND 38.8 AND longitude BETWEEN 31.5 AND 33.5 THEN 1 END) as konya_yakin
FROM "Business" b
JOIN "Category" c ON c.id = b."categoryId"
WHERE c.name ILIKE '%kafe%' AND b."isActive" = true;