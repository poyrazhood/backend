SELECT name, attributes->>'coverImage' as cover, attributes->>'image' as image
FROM "Business" 
WHERE attributes->>'coverImage' IS NOT NULL 
   OR attributes->>'image' IS NOT NULL
LIMIT 3;