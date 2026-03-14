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
 *   node scraper/auto-scraper.cjs run --profile scraper2 ← farklı browser profili
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

const QUERY_TO_CATEGORY = {
  'kafeler':                    'kafeler',
  'restoranlar':                'restoranlar',
  'barlar & gece hayatı':       'barlar',
  'fast food & paket servis':   'fast-food',
  'pastane & fırın':            'pastane-firin',
  'kahvaltı salonu':            'restoranlar',
  'kahve & çay evi':            'kahve-cay',
  'hastane':                    'hastane',
  'eczane':                     'eczane',
  'klinik & poliklinik':        'klinik-poliklinik',
  'diş hekimi':                 'dis-sagligi',
  'spor & fitness':             'spor-fitness',
  'psikolog & psikiyatrist':    'psikoloji-terapi',
  'göz doktoru & optik':        'klinik-poliklinik',
  'fizyoterapi':                'klinik-poliklinik',
  'kuaför & berber':            'kuafor-berber',
  'güzellik merkezi':           'guzellik-merkezi',
  'spa & masaj':                'spa-masaj',
  'dövme stüdyosu':             'dovme-piercing',
  'tırnak bakımı':              'tirnak-studio',
  'epilasyon & güzellik':       'guzellik-merkezi',
  'market & süpermarket':       'market-supermarket',
  'alışveriş merkezi':          'avm',
  'elektronik mağaza':          'elektronik',
  'giyim mağazası':             'giyim-moda',
  'kitabevi & kırtasiye':       'kitap-kirtasiye',
  'mobilya mağazası':           'ev-mobilya',
  'çiçekçi':                    'alisveris',
  'spor malzemeleri':           'alisveris',
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
  'dershane & etüt merkezi':    'kurs-dershane',
  'dil okulu':                  'dil-okulu',
  'müzik kursu':                'muzik-sanat',
  'sürücü kursu':               'kurs-dershane',
  'bilgisayar kursu':           'kurs-dershane',
  'anaokulu & kreş':            'okul',
  'sinema':                     'sinema',
  'müze & sanat galerisi':      'muzeler',
  'oyun merkezi':               'oyun-eglence',
  'düğün & organizasyon salonu': 'dugun-organizasyon',
  'bowling & bilardo':          'oyun-eglence',
  'escape room':                'oyun-eglence',
  'otel':                       'otel',
  'pansiyon & hostel':          'pansiyon-hostel',
  'apart otel':                 'apart-kiralik',
  'veteriner':                  'veteriner',
  'pet shop':                   'pet-shop',
  'hayvan bakımevi':            'hayvan-bakimevi',
  'oto galeri':                 'oto-galeri',
  'araç kiralama':              'oto-kiralama',
  'oto yıkama':                 'oto-servis',
  'lastikçi':                   'oto-servis',
  'oto ekspertiz':              'oto-servis',
};

// ─── QUERY'DEN KATEGORİ SLUG'INI BUL ─────────────────────────────────────────

function getCategorySlugFromQuery(query) {
  const lower = query.toLowerCase();
  for (const [term, slug] of Object.entries(QUERY_TO_CATEGORY)) {
    if (lower.endsWith(term)) return slug;
  }
  for (const [term, slug] of Object.entries(QUERY_TO_CATEGORY)) {
    if (lower.includes(term)) return slug;
  }
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

// ─── OPENCLAW AYARLARI ───────────────────────────────────────────────────────

let ACTIVE_PROFILE = 'openclaw';
let GATEWAY_URL    = null;

// Timeout sabitleri (ms)
const TIMEOUT_NAVIGATE = 15000;
const TIMEOUT_SNAPSHOT = 25000;
const TIMEOUT_EVALUATE = 12000;
const MAX_RETRIES      = 3;

function ocNavigate(url) {
  const args = ['browser', '--browser-profile', ACTIVE_PROFILE];
  if (GATEWAY_URL) args.push('--url', GATEWAY_URL);
  args.push('navigate', url);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const r = spawnSync('openclaw', args, { encoding: 'utf8', shell: true, timeout: TIMEOUT_NAVIGATE });
    if (!r.error) return r.stdout || '';
    if (attempt < MAX_RETRIES) {
      process.stdout.write(`[nav-retry${attempt}] `);
    } else {
      throw new Error(`Navigate hatası: ${r.error.message}`);
    }
  }
}

function ocSnapshot() {
  const args = ['browser', '--browser-profile', ACTIVE_PROFILE];
  if (GATEWAY_URL) args.push('--url', GATEWAY_URL);
  args.push('snapshot');

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const r = spawnSync('openclaw', args, { encoding: 'utf8', shell: true, maxBuffer: 10 * 1024 * 1024, timeout: TIMEOUT_SNAPSHOT });
    if (!r.error) return r.stdout || '';
    if (attempt < MAX_RETRIES) {
      process.stdout.write(`[snap-retry${attempt}] `);
    } else {
      throw new Error(`Snapshot hatası: ${r.error.message}`);
    }
  }
}

function ocPress(key) {
  const args = ['browser', '--browser-profile', ACTIVE_PROFILE];
  if (GATEWAY_URL) args.push('--url', GATEWAY_URL);
  args.push('press', key);
  spawnSync('openclaw', args, { encoding: 'utf8', shell: true, timeout: TIMEOUT_EVALUATE });
}

function ocScrollIntoView(ref) {
  const args = ['browser', '--browser-profile', ACTIVE_PROFILE];
  if (GATEWAY_URL) args.push('--url', GATEWAY_URL);
  args.push('scrollintoview', ref);
  spawnSync('openclaw', args, { encoding: 'utf8', shell: true, timeout: TIMEOUT_EVALUATE });
}

// Son article ref'ini bul → o elemana kaydır → yeni işletmeler yüklenir
function ocScrollResults(snapshot) {
  const refs = [...snapshot.matchAll(/article "[^"]+" \[ref=(e\d+)\]/g)];
  if (refs.length > 0) {
    const lastRef = refs[refs.length - 1][1];
    ocScrollIntoView(lastRef);
  } else {
    ocPress('End');
  }
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

function isDirectPlacePage(snapshot) {
  const hasArticle = /article "[^"]+" \[ref=e\d+\]/.test(snapshot);
  const hasMain = /main "[^"]{2,80}" \[ref=/.test(snapshot);
  return !hasArticle && hasMain;
}

function parseSinglePlace(snapshot) {
  const nameMatch = snapshot.match(/main "([^"]{2,80})" \[ref=/);
  if (!nameMatch) return [];
  const name = nameMatch[1];
  if (name === 'Google Haritalar') return [];

  const coordMatch = snapshot.match(/3d([0-9.]+)!4d([0-9.]+)/);
  const lat = coordMatch ? parseFloat(coordMatch[1]) : null;
  const lng = coordMatch ? parseFloat(coordMatch[2]) : null;

  const ratingMatch = snapshot.match(/text: ([0-9],[0-9])\n/);
  const rating = ratingMatch ? parseFloat(ratingMatch[1].replace(',', '.')) : null;

  const reviewMatch = snapshot.match(/text: \(([0-9.,]+)\)/);
  const reviewCount = reviewMatch ? parseInt(reviewMatch[1].replace(/\./g, '').replace(',', '')) : 0;

  const addrMatch = snapshot.match(/button "Adres: ([^"]+)"/);
  const address = addrMatch ? addrMatch[1] : null;

  return [{ name, rating, reviewCount, lat, lng, googlePlaceId: null, address, priceRange: null, sponsored: false }];
}

// ─── ADRES FİLTRESİ ───────────────────────────────────────────────────────────

const TURKEY_ILLS = [
  'adana','adiyaman','afyonkarahisar','afyon','agri','aksaray','amasya','ankara',
  'antalya','ardahan','artvin','aydin','balikesir','bartin','batman','bayburt',
  'bilecik','bingol','bitlis','bolu','burdur','bursa','canakkale','cankiri',
  'corum','denizli','diyarbakir','duzce','edirne','elazig','erzincan','erzurum',
  'eskisehir','gaziantep','giresun','gumushane','hakkari','hatay','igdir',
  'isparta','istanbul','izmir','kahramanmaras','karabuk','karaman','kars',
  'kastamonu','kayseri','kilis','kirikkale','kirklareli','kirsehir','kocaeli',
  'konya','kutahya','malatya','manisa','mardin','mersin','mugla','mus',
  'nevsehir','nigde','ordu','osmaniye','rize','sakarya','samsun','siirt',
  'sinop','sivas','sanliurfa','sirnak','tekirdag','tokat','trabzon','tunceli',
  'usak','van','yalova','yozgat','zonguldak','izmit','antakya'
];

function toSlugTR(str) {
  return str.toLowerCase()
    .replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s')
    .replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c')
    .replace(/[^a-z0-9\s]/g,'').trim();
}

function isAddressFromWrongCity(address, jobIl) {
  if (!address) return false;
  const addrNorm = toSlugTR(address);
  const jobIlNorm = toSlugTR(jobIl);
  if (addrNorm.includes(jobIlNorm)) return false;
  for (const il of TURKEY_ILLS) {
    if (il === jobIlNorm) continue;
    if (addrNorm.includes(il)) return true;
  }
  return false;
}

// ─── DB IMPORT ───────────────────────────────────────────────────────────────

async function importToDB(businesses, job) {
  const subcategorySlug = getCategorySlugFromQuery(job.query);
  let category = null;
  if (subcategorySlug) category = await findCategory(subcategorySlug);
  if (!category && job.kategori) category = await findCategory(job.kategori);
  if (!category) category = await prisma.category.findFirst();
  if (!category) throw new Error('Hiç kategori bulunamadı!');
  return importWithCategory(businesses, job, category);
}

async function importWithCategory(businesses, job, category) {
  let added = 0, updated = 0, skipped = 0;
  const now = new Date().toISOString();

  // Yanlış şehir olanları önceden filtrele
  const valid = businesses.filter(b => {
    if (isAddressFromWrongCity(b.address, job.il)) { skipped++; return false; }
    return true;
  });

  if (valid.length === 0) return { added, updated, skipped };

  // ── 1. Tek sorguda mevcut kayıtları çek ──────────────────────────────────

  const placeIds  = valid.map(b => b.googlePlaceId).filter(Boolean);
  const nameDistrict = valid.filter(b => !b.googlePlaceId).map(b => b.name);

  const [existingByPlaceId, existingByName] = await Promise.all([
    placeIds.length > 0
      ? prisma.business.findMany({ where: { googlePlaceId: { in: placeIds } }, select: { id: true, slug: true, googlePlaceId: true } })
      : Promise.resolve([]),
    nameDistrict.length > 0
      ? prisma.business.findMany({ where: { name: { in: nameDistrict }, district: job.ilce }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);

  const placeIdMap = new Map(existingByPlaceId.map(e => [e.googlePlaceId, e]));
  const nameMap    = new Map(existingByName.map(e => [e.name, e]));

  // ── 2. Mevcut slug'ları da bir seferde çek (çakışma kontrolü) ────────────
  const baseSlugs   = valid.map(b => toSlug(b.name));
  const existingSlugs = await prisma.business.findMany({
    where: { slug: { in: baseSlugs } },
    select: { slug: true, googlePlaceId: true },
  });
  const slugSet = new Map(existingSlugs.map(e => [e.slug, e.googlePlaceId]));

  // ── 3. Her işletmeyi işle (DB sorgusu YOK, sadece Map lookup) ────────────
  const toCreate = [];
  const toUpdate = [];

  for (const b of valid) {
    try {
      const attrs = {
        priceRange: b.priceRange,
        scrapedAt: now,
        searchTerm: job.query,
        subcategory: category.slug,
      };

      if (b.googlePlaceId) {
        const existing = placeIdMap.get(b.googlePlaceId);
        if (existing) {
          toUpdate.push({
            id: existing.id,
            averageRating: b.rating || 0,
            totalReviews: b.reviewCount || 0,
            attributes: attrs,
            categoryId: category.id,
          });
        } else {
          const slug = resolveSlug(toSlug(b.name), b.googlePlaceId, slugSet);
          toCreate.push({
            name: b.name, slug,
            address: b.address || `${job.ilce}, ${job.il}`,
            city: job.il, district: job.ilce,
            latitude: b.lat, longitude: b.lng,
            googlePlaceId: b.googlePlaceId,
            averageRating: b.rating || 0,
            totalReviews: b.reviewCount || 0,
            categoryId: category.id,
            attributes: attrs,
            isActive: true, isDeleted: false,
          });
        }
      } else {
        const existing = nameMap.get(b.name);
        if (existing) {
          toUpdate.push({ id: existing.id, averageRating: b.rating || 0, categoryId: category.id });
        } else {
          const slug = resolveSlug(toSlug(b.name), null, slugSet);
          toCreate.push({
            name: b.name, slug,
            address: b.address || `${job.ilce}, ${job.il}`,
            city: job.il, district: job.ilce,
            latitude: b.lat, longitude: b.lng,
            googlePlaceId: null,
            averageRating: b.rating || 0,
            totalReviews: b.reviewCount || 0,
            categoryId: category.id,
            attributes: attrs,
            isActive: true, isDeleted: false,
          });
        }
      }
    } catch (e) {
      skipped++;
    }
  }

  // ── 4. Toplu yazma işlemleri ──────────────────────────────────────────────

  // createMany tek sorguda tüm yeni işletmeleri ekler
  if (toCreate.length > 0) {
    try {
      const result = await prisma.business.createMany({ data: toCreate, skipDuplicates: true });
      added = result.count;
      skipped += toCreate.length - result.count; // skipDuplicates ile atlananlar
    } catch (e) {
      // createMany başarısız olursa teker teker dene
      for (const d of toCreate) {
        try { await prisma.business.create({ data: d }); added++; }
        catch { skipped++; }
      }
    }
  }

  // Update'leri paralel gönder (max 10 eşzamanlı)
  if (toUpdate.length > 0) {
    const BATCH = 10;
    for (let i = 0; i < toUpdate.length; i += BATCH) {
      await Promise.all(
        toUpdate.slice(i, i + BATCH).map(u => {
          const { id, ...data } = u;
          return prisma.business.update({ where: { id }, data }).catch(() => {});
        })
      );
      updated += Math.min(BATCH, toUpdate.length - i);
    }
  }

  return { added, updated, skipped };
}

// Slug çakışmasını Map üzerinden çözer — DB sorgusu olmadan
function resolveSlug(baseSlug, googlePlaceId, slugSet) {
  if (!slugSet.has(baseSlug)) {
    slugSet.set(baseSlug, googlePlaceId);
    return baseSlug;
  }
  // Aynı placeId ise slug'ı yeniden kullan
  if (googlePlaceId && slugSet.get(baseSlug) === googlePlaceId) return baseSlug;
  // Çakışma: -2, -3 ... ekle
  let suffix = 2;
  while (slugSet.has(`${baseSlug}-${suffix}`)) suffix++;
  const slug = `${baseSlug}-${suffix}`;
  slugSet.set(slug, googlePlaceId);
  return slug;
}

// ─── TEK JOB ÇALIŞTIR ────────────────────────────────────────────────────────

async function runJob(job, qdb, opts = {}) {
  const { saveSnapshots = false } = opts;
  const label = `[#${job.id}] ${job.query}`;

  try {
    process.stdout.write(`  🔍 ${label} ... `);
    const url = `https://www.google.com/maps/search/${encodeURIComponent(job.query.normalize('NFC'))}`;
    ocNavigate(url);
    await sleep(1200); // 2000 → 1200ms

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
    let lastSnapshot = snapshot;

    // Google direkt işletme sayfasına yönlendirdiyse tek işletmeyi parse et — scroll yok
    if (businesses.length === 0 && isDirectPlacePage(snapshot)) {
      businesses = parseSinglePlace(snapshot);
      if (businesses.length > 0) process.stdout.write('[direkt sayfa] ');
    }

    // Sonuç listesi varsa scroll yaparak daha fazla işletme topla
    if (businesses.length > 0 && !isDirectPlacePage(snapshot)) {
      const seenNames = new Set(businesses.map(b => b.name));
      const MAX_SCROLLS = 5;
      const SCROLL_WAIT = 900; // 1500 → 900ms

      for (let scroll = 0; scroll < MAX_SCROLLS; scroll++) {
        ocScrollResults(lastSnapshot);
        await sleep(SCROLL_WAIT);

        const newSnap = ocSnapshot();
        if (!newSnap || newSnap.length < 100) break;
        lastSnapshot = newSnap;

        const newBizs = parseSnapshot(newSnap);
        let newCount = 0;
        for (const b of newBizs) {
          if (!seenNames.has(b.name)) {
            seenNames.add(b.name);
            businesses.push(b);
            newCount++;
          }
        }

        if (newCount === 0) break;
        process.stdout.write(`[+${newCount}] `);
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
  console.log(`   Profil          : ${ACTIVE_PROFILE}`);
  console.log(`   Çalıştırılacak  : ${jobLimit} job`);
  if (il)   console.log(`   Filtre — İl     : ${il}`);
  if (ilce) console.log(`   Filtre — İlçe   : ${ilce}`);
  console.log(`   Snapshot kaydet : ${saveSnapshots ? 'Evet' : 'Hayır'}\n`);

  let completed = 0, totalAdded = 0, totalUpdated = 0, errors = 0;
  const startTime = Date.now();

  for (let i = 0; i < jobLimit; i++) {
    const job = qdb.prepare(
      `SELECT * FROM jobs WHERE ${where} ORDER BY priority DESC, id ASC LIMIT 1`
    ).get();

    if (!job) { console.log('\n✅ Tüm joblar tamamlandı!'); break; }

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

    await sleep(400 + Math.random() * 300);
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
  const maxJobs    = maxJobsRaw === 'all' ? 'all' : parseInt(maxJobsRaw);
  const il         = getArg('--il');
  const ilce       = getArg('--ilce');
  const saveSnapshots = args.includes('--save-snapshots');

  const profileArg = getArg('--profile');
  if (profileArg) { ACTIVE_PROFILE = profileArg; console.log(`🔧 Profil: ${ACTIVE_PROFILE}`); }

  const urlArg = getArg('--url');
  if (urlArg) { GATEWAY_URL = urlArg; console.log(`🔌 Gateway: ${GATEWAY_URL}`); }

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
  node scraper/auto-scraper.cjs run                      10 job çalıştır
  node scraper/auto-scraper.cjs run --jobs 50            50 job çalıştır
  node scraper/auto-scraper.cjs run --jobs all           tüm jobları çalıştır
  node scraper/auto-scraper.cjs run --il istanbul        sadece İstanbul
  node scraper/auto-scraper.cjs run --ilce kadikoy       sadece Kadıköy
  node scraper/auto-scraper.cjs run --profile scraper2   farklı browser profili
  node scraper/auto-scraper.cjs run --save-snapshots     snapshot dosyalarını kaydet
  node scraper/auto-scraper.cjs test                     1 job test et
`);
  }
}

main().catch(async e => {
  console.error('❌ Kritik hata:', e.message);
  await prisma.$disconnect();
  process.exit(1);
}).finally(() => prisma.$disconnect());
module.exports = { importToDB, getCategorySlugFromQuery };
