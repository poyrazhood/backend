/**
 * fix-categories.cjs
 * 1. Queue'daki ana kategori job'larını skip'ler (9.830 adet)
 * 2. DB'deki yetim kategorileri doğru parent'a bağlar
 * 
 * Kullanım: node fix-categories.cjs
 *           node fix-categories.cjs --dry-run  (sadece göster, değiştirme)
 */

const Database = require('better-sqlite3');
const { PrismaClient } = require('@prisma/client');
const path = require('path');

const prisma = new PrismaClient();
const db = new Database(path.join('memory', 'scraper-queue.db'));
const dryRun = process.argv.includes('--dry-run');

// Ana kategoriler — bunlarla scrape yapılmaz
const PARENT_SLUGS = [
  'yeme-icme', 'ulasim', 'evcil-hayvan', 'konaklama',
  'eglence-kultur', 'egitim', 'hizmetler', 'alisveris',
  'guzellik-bakim', 'saglik-medikal',
];

// Yetim kategoriler → doğru parent slug
const ORPHAN_FIX = {
  'spor-salonu': 'spor-fitness',    // spor-fitness zaten var, bunu sil
  'restoran':    'yeme-icme',       // yeme-icme'ye bağla
  'kafe':        'yeme-icme',       // yeme-icme'ye bağla
  'market':      'alisveris',       // alisveris'e bağla
};

async function main() {
  console.log(`\n${dryRun ? '🔍 DRY RUN — ' : ''}Kategori düzeltme başlıyor...\n`);

  // ── 1. Queue'daki ana kategori job'larını skip'le ──────────────────────────
  console.log('=== QUEUE: Ana kategori job\'ları ===');
  let totalSkipped = 0;

  for (const slug of PARENT_SLUGS) {
    const count = db.prepare(
      "SELECT COUNT(*) as c FROM jobs WHERE kategori=? AND status='pending'"
    ).get(slug).c;

    console.log(`  ${slug}: ${count} pending job`);

    if (!dryRun && count > 0) {
      db.prepare(
        "UPDATE jobs SET status='skipped' WHERE kategori=? AND status='pending'"
      ).run(slug);
    }
    totalSkipped += count;
  }

  console.log(`\n  → Toplam ${totalSkipped} job ${dryRun ? 'skiplenecek' : 'skiplendi'}\n`);

  // ── 2. DB'deki yetim kategorileri düzelt ──────────────────────────────────
  console.log('=== DB: Yetim kategori düzeltme ===');

  for (const [orphanSlug, parentSlug] of Object.entries(ORPHAN_FIX)) {
    const orphan = await prisma.category.findUnique({ where: { slug: orphanSlug } });
    if (!orphan) { console.log(`  ${orphanSlug}: bulunamadı, atlandı`); continue; }

    // spor-salonu'nu sil (spor-fitness zaten var)
    if (orphanSlug === 'spor-salonu') {
      const businessCount = await prisma.business.count({
        where: { categoryId: orphan.id }
      });
      if (businessCount > 0) {
        // İşletmeleri spor-fitness'e taşı
        const sporFitness = await prisma.category.findUnique({ where: { slug: 'spor-fitness' } });
        if (sporFitness && !dryRun) {
          await prisma.business.updateMany({
            where: { categoryId: orphan.id },
            data: { categoryId: sporFitness.id },
          });
          console.log(`  ${orphanSlug}: ${businessCount} işletme spor-fitness'e taşındı`);
        }
      }
      if (!dryRun) {
        await prisma.category.delete({ where: { id: orphan.id } });
        console.log(`  ${orphanSlug}: silindi (spor-fitness zaten var)`);
      } else {
        console.log(`  ${orphanSlug}: silinecek (${businessCount} işletme spor-fitness'e taşınacak)`);
      }
      continue;
    }

    // Diğerleri için parent bağla
    const parent = await prisma.category.findUnique({ where: { slug: parentSlug } });
    if (!parent) { console.log(`  ${orphanSlug}: parent '${parentSlug}' bulunamadı`); continue; }

    if (!dryRun) {
      await prisma.category.update({
        where: { id: orphan.id },
        data: { parentId: parent.id },
      });
    }
    console.log(`  ${orphanSlug} → ${parentSlug} ${dryRun ? '(bağlanacak)' : 'bağlandı'}`);
  }

  // ── 3. Sonuç ──────────────────────────────────────────────────────────────
  console.log('\n=== SONUÇ ===');
  const pendingAfter = db.prepare("SELECT COUNT(*) as c FROM jobs WHERE status='pending'").get().c;
  const skippedAfter = db.prepare("SELECT COUNT(*) as c FROM jobs WHERE status='skipped'").get().c;
  console.log(`  Pending job : ${pendingAfter.toLocaleString()}`);
  console.log(`  Skipped job : ${skippedAfter.toLocaleString()}`);

  if (dryRun) {
    console.log('\n⚠️  DRY RUN — Hiçbir şey değiştirilmedi.');
    console.log('   Gerçekten uygulamak için: node fix-categories.cjs\n');
  } else {
    console.log('\n✅ Tamamlandı.\n');
  }
}

main()
  .catch(console.error)
  .finally(() => { prisma.$disconnect(); db.close(); });
