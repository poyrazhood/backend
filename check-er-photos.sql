SELECT b.id, b.name, er.photos 
FROM "Business" b 
JOIN "ExternalReview" er ON er."businessId" = b.id 
WHERE er.photos IS NOT NULL 
AND jsonb_array_length(er.photos::jsonb) > 0 
LIMIT 3;