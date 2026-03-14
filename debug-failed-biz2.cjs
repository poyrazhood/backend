const { PrismaClient } = require('@prisma/client');
const Database = require('better-sqlite3');
const path = require('path');
const prisma = new PrismaClient();

const MAX_REVIEW_CHARS = 500;
const MAX_TOTAL_CHARS  = 4000;
const trunc = (s, n) => (s && s.length > n) ? s.slice(0, n) + '...' : (s ?? '');

function selectReviews(reviews) {
  if (!reviews.length) return [];
  const sorted = [...reviews].sort((a, b) => new Date(a.publishedAt||0) - new Date(b.publishedAt||0));
  if (reviews.length >= 5) {
    const half = Math.ceil(sorted.length / 2);
    const topN = (arr, n) => [...arr].sort((a,b) => (b.content?.length??0)-(a.content?.length??0)).slice(0,n);
    const selected = [...topN(sorted.slice(0,half),2), ...topN(sorted.slice(half),2), ...topN(reviews,1)];
    const seen = new Set();
    return selected.filter(r => seen.has(r.id) ? false : seen.add(r.id)).slice(0,5);
  }
  return reviews;
}

async function main() {
  const qdb = new Database(path.join(__dirname, 'biz-embed-queue.db'));
  const failed = qdb.prepare('SELECT bizId FROM failed LIMIT 5').all();
  qdb.close();

  for (const { bizId } of failed) {
    const biz = await prisma.business.findUnique({
      where: { id: bizId },
      include: { category: true, externalReviews: { take: 50, where: { content: { not: null } }, select: { id: true, content: true, publishedAt: true, ownerReply: true } } }
    });
    if (!biz) continue;

    const selected = selectReviews(biz.externalReviews);
    const reviewTexts = selected.map(r => trunc(r.content?.trim(), MAX_REVIEW_CHARS)).filter(Boolean);
    const ownerReplies = selected.map(r => r.ownerReply).filter(Boolean).map(r => trunc(r.trim(), MAX_REVIEW_CHARS));
    
    const header = [biz.name, biz.category?.name, biz.city, biz.district].filter(Boolean).join(' | ');
    const yorumlar = reviewTexts.length > 0 ? ' | Yorumlar: ' + reviewTexts.join(' / ') : '';
    const replies = ownerReplies.length > 0 ? ' | Yanit: ' + ownerReplies.join(' / ') : '';
    const text = trunc(header + yorumlar + replies, MAX_TOTAL_CHARS);

    console.log(`\n--- ${biz.name} ---`);
    console.log(`Metin uzunlugu: ${text.length}`);

    const res = await fetch('http://localhost:11434/api/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'mxbai-embed-large', input: [text] }),
    });
    const body = res.ok ? 'OK' : await res.text();
    console.log(`Ollama: HTTP ${res.status} — ${body.slice(0,100)}`);
  }
}
main().finally(() => prisma.$disconnect());
