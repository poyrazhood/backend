const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.business.findMany({ select: { id: true, name: true } })
  .then(r => r.forEach(b => console.log(b.id, '|', b.name)))
  .finally(() => p.$disconnect());
