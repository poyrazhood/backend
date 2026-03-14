const { PrismaClient } = require('@prisma/client');
const Database = require('better-sqlite3');
const path = require('path');
const prisma = new PrismaClient();

async function main() {
  const qdb = new Database(path.join(__dirname, 'biz-embed-queue.db'));
  const failed = qdb.prepare('SELECT bizId FROM failed LIMIT 3').all();
  qdb.close();

  for (const { bizId } of failed) {
    const biz = await prisma.business.findUnique({
      where: { id: bizId },
      include: { category: true, externalReviews: { take: 50, where: { content: { not: null } } } }
    });
    if (!biz) { console.log(bizId, '— bulunamadı'); continue; }

    const texts = biz.externalReviews.map(r => r.content);
    const totalLen = texts.join(' / ').length;
    console.log(`\n--- ${biz.name} ---`);
    console.log(`Yorum sayısı: ${biz.externalReviews.length}`);
    console.log(`Toplam yorum karakter: ${totalLen}`);
    console.log(`En uzun yorum: ${Math.max(...texts.map(t => t?.length ?? 0))}`);

    // Ollama test
    const fullText = biz.name + ' | ' + texts.join(' / ');
    const res = await fetch('http://localhost:11434/api/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'mxbai-embed-large', input: [fullText] }),
    });
    const body = await res.text();
    console.log(`Ollama: HTTP ${res.status} — ${res.ok ? 'OK' : body.slice(0, 200)}`);
  }
}

main().finally(() => prisma.$disconnect());
