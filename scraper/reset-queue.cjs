'use strict';
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const Database = require('better-sqlite3');
const path = require('path');

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const QUEUE_DB = path.join(__dirname, '..', 'memory', 'review-queue.db');
const db = new Database(QUEUE_DB);
db.pragma('journal_mode = WAL');

async function main() {
  // 1. Yorumu olan tüm işletmeleri al
  console.log('İşletmeler alınıyor...');
  const businesses = await prisma.business.findMany({
    where: { isActive: true, isDeleted: false, totalReviews: { gt: 0 } },
    select: { id: true }
  });
  console.log('Toplam yorumu olan:', businesses.length);

  // 2. Zaten çekilmiş işletmeleri al
  const scraped = await prisma.externalReview.groupBy({ by: ['businessId'] });
  const scrapedSet = new Set(scraped.map(r => r.businessId));
  console.log('Zaten çekilmiş:', scrapedSet.size);

  // 3. Queue sıfırla
  db.prepare('DELETE FROM jobs').run();
  console.log('Queue sıfırlandı');

  // 4. Hepsini ekle
  const ins = db.prepare('INSERT OR IGNORE INTO jobs (business_id) VALUES (?)');
  const insertAll = db.transaction(ids => { for (const id of ids) ins.run(id); });
  insertAll(businesses.map(b => b.id));
  console.log('Eklendi:', businesses.length);

  // 5. Zaten çekilmişleri done işaretle
  const done = db.prepare("UPDATE jobs SET status='done', done_at=? WHERE business_id=?");
  const markDone = db.transaction(ids => { for (const id of ids) done.run(new Date().toISOString(), id); });
  markDone([...scrapedSet]);
  console.log('Done işaretlendi:', scrapedSet.size);

  const pending = db.prepare("SELECT COUNT(*) as c FROM jobs WHERE status='pending'").get().c;
  console.log('Kalan pending:', pending);

  db.close();
}

main().catch(console.error).finally(() => prisma.$disconnect());
