const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

p.$queryRawUnsafe(`
  SELECT name, city, attributes
  FROM "Business"
  WHERE attributes->'about' IS NOT NULL
  AND attributes->>'coverPhoto' IS NOT NULL
  LIMIT 1
`).then(r => {
  console.log('İsim:', r[0].name);
  console.log('Şehir:', r[0].city);
  console.log('Attributes:');
  console.log(JSON.stringify(r[0].attributes, null, 2));
}).finally(() => p.$disconnect());
