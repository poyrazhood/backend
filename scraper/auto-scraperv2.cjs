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

// ─── ARAMA TERİMİ → DOĞRU SUBCATEGORY SLUG HARİTASI ─────────────────────────
// query içindeki arama terimi (küçük harf) → category slug (DB'deki)

const QUERY_TO_CATEGORY = {
  // Yeme & İçme
  'kafeler':                    'kafeler',
  'restoranlar':                'restoranlar',
  'barlar & gece hayatı':       'barlar',
  'fast food & paket servis':   'fast-food',
  'pastane & fırın':            'pastane-firin',
  'kahvaltı salonu':            'restoranlar',
  'kahve & çay evi':            'kahve-cay',

  // Sağlık & Medikal
  'hastane':                    'hastane',
  'eczane':                     'eczane',
  'klinik & poliklinik':        'klinik-poliklinik',
  'diş hekimi':                 'dis-sagligi',
  'spor & fitness':             'spor-fitness',
  'psikolog & psikiyatrist':    'psikoloji-terapi',
  'göz doktoru & optik':        'klinik-poliklinik',
  'fizyoterapi':                'klinik-poliklinik',

  // Güzellik & Bakım
  'kuaför & berber':            'kuafor-berber',
  'güzellik merkezi':           'guzellik-merkezi',
  'spa & masaj':                'spa-masaj',
  'dövme stüdyosu':             'dovme-piercing',
  'tırnak bakımı':              'tirnak-studio',
  'epilasyon & güzellik':       'guzellik-merkezi',

  // Alışveriş
  'market & süpermarket':       'market-supermarket',
  'alışveriş merkezi':          'avm',
  'elektronik mağaza':          'elektronik',
  'giyim mağazası':             'giyim-moda',
  'kitabevi & kırtasiye':       'kitap-kirtasiye',
  'mobilya mağazası':           'ev-mobilya',
  'çiçekçi':                    'alisveris',
  'spor malzemeleri':           'alisveris',

  // Hizmetler
  'avukat & hukuk bürosu':      'hukuk',
  'mali müşavir & muhasebe':    'muhasebe-finans',
  'nakliyat':                   'nakliyat',
  'oto servis & tamirci':       'oto-servis',
  'temizlik şirketi':           'temizlik',
  'tadilat & boya':             'tadilat-insaat',
  'fotoğrafçı':                 'hizmetler',
  'sigorta acentesi':           'hizmetler',
  'emlak ofisi':                'hizmetler',
  'noter':                      'hizmetler',

  // Eğitim
  'dershane & etüt merkezi':    'kurs-dershane',
  'dil okulu':                  'dil-okulu',
  'müzik kursu':                'muzik-sanat',
  'sürücü kursu':               'kurs-dershane',
  'bilgisayar kursu':           'kurs-dershane',
  'anaokulu & kreş':            'okul',

  // Eğlence & Kültür
  'sinema':                     'sinema',
  'müze & sanat galerisi':      'muzeler',
  'oyun merkezi':               'oyun-eglence',
  'düğün & organizasyon salonu': 'dugun-organizasyon',
  'bowling & bilardo':          'oyun-eglence',
  'escape room':                'oyun-eglence',

  // Konaklama
  'otel':                       'otel',
  'pansiyon & hostel':          'pansiyon-hostel',
  'apart otel':                 'apart-kiralik',

  // Evcil Hayvan
  'veteriner':                  'veteriner',
  'pet shop':                   'pet-shop',
  'hayvan bakımevi':            'hayvan-bakimevi',

  // Ulaşım & Araç
  'oto galeri':                 'oto-galeri',
  'araç kiralama':              'oto-kiralama',
  'oto yıkama':                 'oto-servis',
  'lastikçi':                   'oto-servis',
  'oto ekspertiz':              'oto-servis',
};

// ─── QUERY'DEN KATEGORİ SLUG'INI BUL ─────────────────────────────────────────

function getCategorySlugFromQuery(query) {
  const lower = query.toLowerCase();

  // Önce tam eşleşme dene (sorgunun sonundaki arama terimi)
  for (const [term, slug] of Object.entries(QUERY_TO_CATEGORY)) {
    if (lower.endsWith(term)) return slug;
  }

  // İçerik eşleşmesi
  for (const [term, slug] of Object.entries(QUERY_TO_CATEGORY)) {
    if (lower.includes(term)) return slug;
  }

  // job.kategori alanını fallback olarak döndür
  return null;
}

// ─── KATEGORİ CACHE ───────────────────────────────────────────────────────────

const categoryCache = {};

async function findCategory(slug) {
  if (categoryCache[slug]) return categoryCache[slug];
  const cat = await prisma.category.findUnique({ where: { slug } });
  if (cat) categoryCache[slug] = cat;
  return cat;
}

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

// ─── SNAPSHOT PARSER ─────────────────────────────────────────────────────────

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


// ─── TEK İŞLETME SAYFASI PARSER ──────────────────────────────────────────────
// Google direkt bir işletmenin sayfasına yönlendirince liste yerine tek işletme gelir
// Tespit: snapshot'ta `main "İŞLETME ADI"` var ama `article "..." [ref=e\d+]` yok

function isDirectPlacePage(snapshot) {
  const hasArticle = /article "[^"]+" \[ref=e\d+\]/.test(snapshot);
  const hasMain = /main "[^"]{2,80}" \[ref=/.test(snapshot);
  return !hasArticle && hasMain;
}

function parseSinglePlace(snapshot) {
  // İsim: main "..." [ref=...] içinden
  const nameMatch = snapshot.match(/main "([^"]{2,80})" \[ref=/);
  if (!nameMatch) return [];

  const name = nameMatch[1];
  if (name === 'Google Haritalar') return [];

  // Koordinatlar: Adres butonundaki URL'den veya link URL'lerinden
  let lat = null, lng = null;
  const coordMatch = snapshot.match(/3d([0-9.]+)!4d([0-9.]+)/);
  if (coordMatch) {
    lat = parseFloat(coordMatch[1]);
    lng = parseFloat(coordMatch[2]);
  }

  // Place ID
  const placeMatch = snapshot.match(/fp=([0-9]+)/);
  const googlePlaceId = placeMatch ? placeMatch[1] : null;

  // Puan
  const ratingMatch = snapshot.match(/text: ([0-9],[0-9])\n/);
  const rating = ratingMatch ? parseFloat(ratingMatch[1].replace(',', '.')) : null;

  // Yorum sayısı
  const reviewMatch = snapshot.match(/text: \(([0-9.,]+)\)/);
  const reviewCount = reviewMatch ? parseInt(reviewMatch[1].replace(/\./g, '').replace(',', '')) : 0;

  // Adres: button "Adres: ..." içinden
  const addrMatch = snapshot.match(/button "Adres: ([^"]+)"/);
  const address = addrMatch ? addrMatch[1] : null;

  return [{ name, rating, reviewCount, lat, lng, googlePlaceId, address, priceRange: null, sponsored: false }];
}

// ─── DB IMPORT ───────────────────────────────────────────────────────────────

async function importToDB(businesses, job) {
  // 1. Arama teriminden doğru subcategory slug'ı bul
  const subcategorySlug = getCategorySlugFromQuery(job.query);

  // 2. Subcategory'yi dene
  let category = null;
  if (subcategorySlug) {
    category = await findCategory(subcategorySlug);
  }

  // 3. Ana kategori slug'ını dene (job.kategori)
  if (!category && job.kategori) {
    category = await findCategory(job.kategori);
  }

  // 4. Son çare: DB'deki ilk kategori
  if (!category) {
    category = await prisma.category.findFirst();
  }

  if (!category) throw new Error('Hiç kategori bulunamadı!');

  return importWithCategory(businesses, job, category);
}

async function importWithCategory(businesses, job, category) {
  let added = 0, updated = 0, skipped = 0;

  for (const b of businesses) {
    try {
      // Adres kontrolü: işletmenin adresi job'un ilçesiyle eşleşmiyorsa atla
      if (b.address) {
        const addrLower = b.address.toLowerCase();
        const ilceLower = job.ilce.toLowerCase()
          .replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s')
          .replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c');
        const addrNorm = addrLower
          .replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s')
          .replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c');
        // İlçe adı adreste geçmiyorsa bu işletme başka bir yerde demektir
        if (!addrNorm.includes(ilceLower)) {
          skipped++;
          continue;
        }
      }
      const baseSlug = toSlug(b.name);
      let slug = baseSlug;
      let suffix = 1;

      while (true) {
        const existing = await prisma.business.findUnique({ where: { slug } });
        if (!existing) break;
        if (b.googlePlaceId && existing.googlePlaceId === b.googlePlaceId) { slug = existing.slug; break; }
        slug = `${baseSlug}-${++suffix}`;
      }

      const attrs = {
        priceRange: b.priceRange,
        scrapedAt: new Date().toISOString(),
        searchTerm: job.query,        // hangi aramayla bulundu
        subcategory: category.slug,   // hangi subcategory
      };

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
            data: {
              averageRating: data.averageRating,
              totalReviews: data.totalReviews,
              attributes: attrs,
              // Kategori güncelle (eski veriler yanlış kategorideyse düzelt)
              categoryId: category.id,
            },
          });
          updated++;
        } else {
          await prisma.business.create({ data });
          added++;
        }
      } else {
        const existing = await prisma.business.findFirst({ where: { name: b.name, district: job.ilce } });
        if (existing) {
          await prisma.business.update({ where: { id: existing.id }, data: { averageRating: data.averageRating, categoryId: category.id } });
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
    process.stdout.write(`  🔍 ${label} ... `);
    const url = `https://www.google.com/maps/search/${encodeURIComponent(job.query.normalize('NFC'))}`;
    ocNavigate(url);
    await sleep(3500);

    const snapshot = ocSnapshot();

    if (!snapshot || snapshot.length < 100) {
      process.stdout.write('⚠️  boş snapshot\n');
      qdb.prepare("UPDATE jobs SET status='failed', error='empty snapshot' WHERE id=?").run(job.id);
      return { added: 0, updated: 0, skipped: 0 };
    }

    if (saveSnapshots) {
      if (!fs.existsSync(SNAP_DIR)) fs.mkdirSync(SNAP_DIR, { recursive: true });
      const snapFile = path.join(SNAP_DIR, `job-${job.id}-${job.il_slug}-${job.ilce_slug}-${job.kategori}.txt`);
      fs.writeFileSync(snapFile, snapshot, 'utf8');
    }

    let businesses = parseSnapshot(snapshot);

    // Google direkt işletme sayfasına yönlendirdiyse tek işletmeyi parse et
    if (businesses.length === 0 && isDirectPlacePage(snapshot)) {
      businesses = parseSinglePlace(snapshot);
      if (businesses.length > 0) {
        process.stdout.write('[direkt sayfa] ');
      }
    }

    if (businesses.length === 0) {
      process.stdout.write('⚠️  sonuç yok\n');
      qdb.prepare("UPDATE jobs SET status='done', done_at=?, result_count=0 WHERE id=?")
        .run(new Date().toISOString(), job.id);
      return { added: 0, updated: 0, skipped: 0 };
    }

    const stats = await importToDB(businesses, job);
    process.stdout.write(`✅ ${businesses.length} bulundu → ${stats.added} yeni, ${stats.updated} güncellendi\n`);

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

    qdb.prepare("UPDATE jobs SET status='running', started_at=? WHERE id=?")
      .run(new Date().toISOString(), job.id);

    const stats = await runJob(job, qdb, { saveSnapshots });
    totalAdded   += stats.added;
    totalUpdated += stats.updated;
    if (stats.added === 0 && stats.updated === 0) errors++;
    completed++;

    if (completed % 10 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      console.log(`\n📊 ${completed}/${jobLimit} tamamlandı | ${totalAdded} yeni işletme | ${elapsed} dk\n`);
    }

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
