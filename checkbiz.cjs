const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const id = process.argv[2];
  const biz = await p.business.findUnique({ where: { id } });
  console.log(JSON.stringify(biz, null, 2));
}

main().catch(console.error).finally(() => p.$disconnect());
