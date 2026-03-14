SELECT er."businessId", b.name, er.photos
FROM "ExternalReview" er
JOIN "Business" b ON b.id = er."businessId"
WHERE jsonb_array_length(er.photos::jsonb) > 0
LIMIT 3;