const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const all = await p.category.findMany({
    select: { id: true, name: true, slug: true, parentId: true },
    orderBy: { name: 'asc' },
  });

  const parents = all.filter(c => !c.parentId);
  const children = all.filter(c => c.parentId);

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║           KATEGORİ AĞACI                        ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  for (const parent of parents) {
    const subs = children.filter(c => c.parentId === parent.id);
    console.log(`■ ${parent.name} (${parent.slug})`);
    for (const sub of subs) {
      console.log(`  └─ ${sub.name} (${sub.slug})`);
    }
    if (subs.length === 0) console.log(`  └─ (alt kategori yok)`);
    console.log();
  }

  console.log(`Toplam: ${parents.length} ana, ${children.length} alt kategori`);
}

main().catch(console.error).finally(() => p.$disconnect());
