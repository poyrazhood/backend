const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.business.findMany({ take: 5 })
  .then(bs => bs.forEach(b => console.log(b.id, '|', b.name, '|', b.city)))
  .finally(() => p.$disconnect());
