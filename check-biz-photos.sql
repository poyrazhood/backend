SELECT er."businessId", er.photos 
FROM "ExternalReview" er 
WHERE er."businessId" IN ('cmm4t0l0e06pnp0gnr877x3sb', 'cmm5iz5ty0gdlvqsspwmikw0q')
AND er.photos IS NOT NULL
LIMIT 5;