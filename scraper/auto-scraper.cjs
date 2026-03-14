/**
 * auto-scraper.cjs
 * Scraper queue'daki jobları otomatik çalıştırır.
 * openclaw browser ile navigate → snapshot → parse → import → done
 *
 * Kullanım:
 *   node scraper/auto-scraper.cjs run              ← 10 job çalıştır (varsayılan)
 *   node scraper/auto-scraper.cjs run --jobs 50    ← 50 job çalıştır
 *   node scraper/auto-scraper.cjs run --jobs all   ← tüm jobları çalıştır
 *   node scraper/auto-scraper.cjs run --il istanbul ← sadece istanbul
 *   node scraper/auto-scraper.cjs run --ilce kadikoy ← sadece kadıköy
 *   node scraper/auto-scraper.cjs test             ← 1 job test et
 */

const { spawnSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const QUEUE_DB   = path.join(__dirname, '..', 'memory', 'scraper-queue.db');
const SNAP_DIR   = path.join(__dirname, '..', 'memory', 'snapshots');

// ─── YARDIMCILAR ─────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function ocNavigate(url) {
  const r = spawnSync('openclaw', ['browser', '--browser-profile', 'openclaw', 'navigate', url],
    { encoding: 'utf8', shell: true, timeout: 15000 });
  if (r.error) throw new Error(`Navigate hatası: ${r.error.message}`);
  return r.stdout || '';
}

function ocSnapshot() {
  const r = spawnSync('openclaw', ['browser', '--browser-profile', 'openclaw', 'snapshot'],
    { encoding: 'utf8', shell: true, maxBuffer: 10 * 1024 * 1024, timeout: 20000 });
  if (r.error) throw new Error(`Snapshot hatası: ${r.error.message}`);
  return r.stdout || '';
}

// ─── SNAPSHOT PARSER (maps-scraper.cjs ile aynı mantık) ──────────────────────

function toSlug(str) {
  return str
    .toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-')
    .replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function parseSnapshot(text) {
  const lines = text.split('\n');
  const results = [];
  let current = null;

  for (const line of lines) {
    const articleMatch = line.match(/article "([^"]+)" \[ref=e\d+\]/);
    if (articleMatch) {
      if (current) results.push(current);
      current = { name: articleMatch[1], rating: null, reviewCount: 0, lat: null, lng: null, googlePlaceId: null, address: null, priceRange: null, sponsored: false };
      continue;
    }
    if (!current) continue;

    if (line.includes('heading "Sponsorlu"')) current.sponsored = true;

    const ratingMatch = line.match(/^\s+- text: ([0-9],[0-9])\s*$/);
    if (ratingMatch && !current.rating) current.rating = parseFloat(ratingMatch[1].replace(',', '.'));

    const reviewMatch = line.match(/text: \(([0-9.,]+)\)/);
    if (reviewMatch) current.reviewCount = parseInt(reviewMatch[1].replace(/\./g, '').replace(',', ''));

    const coordMatch = line.match(/3d([0-9.]+)!4d([0-9.]+)/);
    if (coordMatch) { current.lat = parseFloat(coordMatch[1]); current.lng = parseFloat(coordMatch[2]); }

    const placeMatch = line.match(/!1s([^!&]+)/);
    if (placeMatch && !current.googlePlaceId) current.googlePlaceId = placeMatch[1];

    const priceMatch = line.match(/₺([0-9]+)[–-]([0-9]+)/);
    if (priceMatch) current.priceRange = `₺${priceMatch[1]}-${priceMatch[2]}`;
  }

  if (current) results.push(current);
  return results.filter(b => !b.sponsored && b.name.length > 1);
}

// ─── DB IMPORT ───────────────────────────────────────────────────────────────

async function importToDB(businesses, job) {
  const category = await prisma.category.findFirst({ where: { slug: job.kategori } });
  if (!category) {
    // Kategori slug eşleşmeyebilir, ilk kategoriyi fallback olarak kullan
    const fallback = await prisma.category.findFirst();
    if (!fallback) throw new Error(`Kategori bulunamadı: ${job.kategori}`);
    return importWithCategory(businesses, job, fallback);
  }
  return importWithCategory(businesses, job, category);
}

async function importWithCategory(businesses, job, category) {
  let added = 0, updated = 0, skipped = 0;

  for (const b of businesses) {
    try {
      const baseSlug = toSlug(b.name);
      let slug = baseSlug;
      let suffix = 1;

      while (true) {
        const existing = await prisma.business.findUnique({ where: { slug } });
        if (!existing) break;
        if (b.googlePlaceId && existing.googlePlaceId === b.googlePlaceId) { slug = existing.slug; break; }
        slug = `${baseSlug}-${++suffix}`;
      }

      const attrs = { priceRange: b.priceRange, scrapedAt: new Date().toISOString() };

      const data = {
        name: b.name, slug,
        address: b.address || `${job.ilce}, ${job.il}`,
        city: job.il,
        district: job.ilce,
        latitude: b.lat, longitude: b.lng,
        googlePlaceId: b.googlePlaceId || null,
        averageRating: b.rating || 0,
        totalReviews: b.reviewCount || 0,
        categoryId: category.id,
        attributes: attrs,
        isActive: true, isDeleted: false,
      };

      if (b.googlePlaceId) {
        const existing = await prisma.business.findUnique({ where: { googlePlaceId: b.googlePlaceId } });
        if (existing) {
          await prisma.business.update({
            where: { googlePlaceId: b.googlePlaceId },
            data: { averageRating: data.averageRating, totalReviews: data.totalReviews, attributes: attrs },
          });
          updated++;
        } else {
          await prisma.business.create({ data });
          added++;
        }
      } else {
        const existing = await prisma.business.findFirst({ where: { name: b.name, district: job.ilce } });
        if (existing) {
          await prisma.business.update({ where: { id: existing.id }, data: { averageRating: data.averageRating } });
          updated++;
        } else {
          await prisma.business.create({ data });
          added++;
        }
      }
    } catch (e) {
      skipped++;
    }
  }
  return { added, updated, skipped };
}

// ─── TEK JOB ÇALIŞTIR ────────────────────────────────────────────────────────

async function runJob(job, qdb, opts = {}) {
  const { saveSnapshots = false } = opts;
  const label = `[#${job.id}] ${job.query}`;

  try {
    // 1. Navigate
    process.stdout.write(`  🔍 ${label} ... `);
    const url = `https://www.google.com/maps/search/${encodeURIComponent(job.query.normalize('NFC'))}`;
    ocNavigate(url);
    await sleep(3500);

    // 2. Snapshot
    const snapshot = ocSnapshot();

    if (!snapshot || snapshot.length < 100) {
      process.stdout.write('⚠️  boş snapshot\n');
      qdb.prepare("UPDATE jobs SET status='failed', error='empty snapshot' WHERE id=?").run(job.id);
      return { added: 0, updated: 0, skipped: 0 };
    }

    // 3. Snapshot kaydet (opsiyonel)
    if (saveSnapshots) {
      if (!fs.existsSync(SNAP_DIR)) fs.mkdirSync(SNAP_DIR, { recursive: true });
      const snapFile = path.join(SNAP_DIR, `job-${job.id}-${job.il_slug}-${job.ilce_slug}-${job.kategori}.txt`);
      fs.writeFileSync(snapFile, snapshot, 'utf8');
    }

    // 4. Parse
    const businesses = parseSnapshot(snapshot);

    if (businesses.length === 0) {
      process.stdout.write('⚠️  sonuç yok\n');
      qdb.prepare("UPDATE jobs SET status='done', done_at=?, result_count=0 WHERE id=?")
        .run(new Date().toISOString(), job.id);
      return { added: 0, updated: 0, skipped: 0 };
    }

    // 5. Import
    const stats = await importToDB(businesses, job);
    process.stdout.write(`✅ ${stats.added} yeni, ${stats.updated} güncellendi\n`);

    // 6. Done
    qdb.prepare("UPDATE jobs SET status='done', done_at=?, result_count=? WHERE id=?")
      .run(new Date().toISOString(), businesses.length, job.id);

    return stats;

  } catch (e) {
    process.stdout.write(`❌ HATA: ${e.message}\n`);
    qdb.prepare("UPDATE jobs SET status='failed', error=? WHERE id=?").run(e.message, job.id);
    return { added: 0, updated: 0, skipped: 0 };
  }
}

// ─── ANA DÖNGÜ ───────────────────────────────────────────────────────────────

async function run(opts = {}) {
  const { maxJobs = 10, il = null, ilce = null, saveSnapshots = false } = opts;

  const qdb = new Database(QUEUE_DB);

  // Filtreli sorgu
  let where = "status='pending'";
  if (il)   where += ` AND lower(il_slug) = '${toSlug(il)}'`;
  if (ilce) where += ` AND lower(ilce_slug) = '${toSlug(ilce)}'`;

  const totalPending = qdb.prepare(`SELECT COUNT(*) as c FROM jobs WHERE ${where}`).get().c;
  const jobLimit = maxJobs === 'all' ? totalPending : maxJobs;

  console.log(`\n🚀 Otomatik Scraper Başladı`);
  console.log(`   Çalıştırılacak: ${jobLimit} job`);
  if (il)   console.log(`   Filtre — İl: ${il}`);
  if (ilce) console.log(`   Filtre — İlçe: ${ilce}`);
  console.log(`   Snapshot kaydet: ${saveSnapshots ? 'Evet' : 'Hayır'}\n`);

  let completed = 0, totalAdded = 0, totalUpdated = 0, errors = 0;
  const startTime = Date.now();

  for (let i = 0; i < jobLimit; i++) {
    const job = qdb.prepare(
      `SELECT * FROM jobs WHERE ${where} ORDER BY priority DESC, id ASC LIMIT 1`
    ).get();

    if (!job) {
      console.log('\n✅ Tüm joblar tamamlandı!');
      break;
    }

    // Running işaretle
    qdb.prepare("UPDATE jobs SET status='running', started_at=? WHERE id=?")
      .run(new Date().toISOString(), job.id);

    const stats = await runJob(job, qdb, { saveSnapshots });
    totalAdded   += stats.added;
    totalUpdated += stats.updated;
    if (stats.added === 0 && stats.updated === 0) errors++;
    completed++;

    // İlerleme göster
    if (completed % 10 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      console.log(`\n📊 ${completed}/${jobLimit} tamamlandı | ${totalAdded} yeni işletme | ${elapsed} dk\n`);
    }

    // Rate limiting — Google'a karşı nazik ol
    const delay = 2000 + Math.random() * 2000;
    await sleep(delay);
  }

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n═══════════════════════════════`);
  console.log(`✅ Tamamlandı`);
  console.log(`   Çalışan job    : ${completed}`);
  console.log(`   Yeni işletme   : ${totalAdded}`);
  console.log(`   Güncellenen    : ${totalUpdated}`);
  console.log(`   Hata           : ${errors}`);
  console.log(`   Süre           : ${elapsed} dakika`);
  console.log(`═══════════════════════════════\n`);

  qdb.close();
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  const getArg = (flag) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : null;
  };

  const maxJobsRaw = getArg('--jobs') || '10';
  const maxJobs = maxJobsRaw === 'all' ? 'all' : parseInt(maxJobsRaw);
  const il   = getArg('--il');
  const ilce = getArg('--ilce');
  const saveSnapshots = args.includes('--save-snapshots');

  switch (cmd) {
    case 'run':
      await run({ maxJobs, il, ilce, saveSnapshots });
      break;

    case 'test': {
      const qdb = new Database(QUEUE_DB);
      const job = qdb.prepare("SELECT * FROM jobs WHERE status='pending' ORDER BY priority DESC, id ASC LIMIT 1").get();
      if (!job) { console.log('Bekleyen job yok.'); qdb.close(); break; }
      qdb.prepare("UPDATE jobs SET status='running', started_at=? WHERE id=?").run(new Date().toISOString(), job.id);
      console.log(`\n🧪 Test job: ${job.query}`);
      await runJob(job, qdb, { saveSnapshots: true });
      qdb.close();
      break;
    }

    default:
      console.log(`
🦞 auto-scraper.cjs — Tecrubelerim.com

Kullanım:
  node scraper/auto-scraper.cjs run                    10 job çalıştır
  node scraper/auto-scraper.cjs run --jobs 50          50 job çalıştır
  node scraper/auto-scraper.cjs run --jobs all         tüm jobları çalıştır
  node scraper/auto-scraper.cjs run --il istanbul      sadece İstanbul
  node scraper/auto-scraper.cjs run --ilce kadikoy     sadece Kadıköy
  node scraper/auto-scraper.cjs run --save-snapshots   snapshot dosyalarını kaydet
  node scraper/auto-scraper.cjs test                   1 job test et
`);
  }
}

main().catch(async e => {
  console.error('❌ Kritik hata:', e.message);
  await prisma.$disconnect();
  process.exit(1);
}).finally(() => prisma.$disconnect());
