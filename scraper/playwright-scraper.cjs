/**
 * playwright-scraper.cjs
 * Her worker kendi Chromium instance'ını açar → gerçek paralel çalışma
 *
 * Kurulum:
 *   npm install playwright
 *   npx playwright install chromium
 *
 * Kullanım:
 *   node scraper/playwright-scraper.cjs run --workers 3
 *   node scraper/playwright-scraper.cjs run --workers 5 --il istanbul
 *   node scraper/playwright-scraper.cjs test
 */

const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const Database = require('better-sqlite3');
const path = require('path');

const prisma = new PrismaClient();
const QUEUE_DB = path.join(__dirname, '..', 'memory', 'scraper-queue.db');

// ─── KONFİGÜRASYON ───────────────────────────────────────────────────────────

const CFG = {
  NAVIGATE_WAIT : 1500,   // ms — sayfa yükleme bekle
  SCROLL_WAIT   : 800,    // ms — scroll sonrası bekle
  MAX_SCROLLS   : 5,      // kaç kez scroll yapılacak
  MIN_DELAY     : 600,    // ms — joblar arası min bekleme
  MAX_DELAY     : 1000,   // ms — joblar arası max bekleme
  HEADLESS      : true,   // false yapınca Chrome görünür (debug için)
  // Proxy: 'http://user:pass@host:port' — her worker için ayrı proxy isterseniz
  // PROXIES: ['http://...', 'http://...'],
};

// ─── YARDIMCILAR ─────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function rndDelay() { return sleep(CFG.MIN_DELAY + Math.random() * (CFG.MAX_DELAY - CFG.MIN_DELAY)); }

function toSlug(str) {
  return str.toLowerCase()
    .replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s')
    .replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c')
    .replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'-')
    .replace(/-+/g,'-').replace(/^-|-$/g,'');
}

// ─── JOB QUEUE (WAL modu — paralel güvenli) ──────────────────────────────────

class JobQueue {
  constructor() {
    this.db = new Database(QUEUE_DB);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
  }

  claimJob(il, ilce) {
    let where = "status='pending'";
    if (il)   where += ` AND il_slug='${toSlug(il)}'`;
    if (ilce) where += ` AND ilce_slug='${toSlug(ilce)}'`;

    return this.db.transaction(() => {
      const job = this.db.prepare(
        `SELECT * FROM jobs WHERE ${where} ORDER BY priority DESC, id ASC LIMIT 1`
      ).get();
      if (!job) return null;
      // Atomik: sadece hâlâ pending olanı al
      const changed = this.db.prepare(
        "UPDATE jobs SET status='running', started_at=? WHERE id=? AND status='pending'"
      ).run(new Date().toISOString(), job.id).changes;
      return changed ? job : null; // başka worker kaptıysa null
    })();
  }

  done(id, count)  { this.db.prepare("UPDATE jobs SET status='done', done_at=?, result_count=? WHERE id=?").run(new Date().toISOString(), count, id); }
  fail(id, err)    { this.db.prepare("UPDATE jobs SET status='failed', error=? WHERE id=?").run(String(err).slice(0,400), id); }
  pending(il,ilce) {
    let w = "status='pending'";
    if (il)   w += ` AND il_slug='${toSlug(il)}'`;
    if (ilce) w += ` AND ilce_slug='${toSlug(ilce)}'`;
    return this.db.prepare(`SELECT COUNT(*) as c FROM jobs WHERE ${w}`).get().c;
  }
  close() { this.db.close(); }
}

// ─── GOOGLE MAPS PARSER ───────────────────────────────────────────────────────
// Playwright page.content() ile HTML alıp regex parse — openclaw snapshot'a benzer

function parsePageContent(html) {
  // Google Maps, işletme verilerini window.APP_INITIALIZATION_STATE içinde JS olarak gömüyor
  // Ama daha basit: aria label'lardan parse ederiz (aynı snapshot mantığı)
  const results = [];

  // Her işletme kartı için name + rating + reviewCount + koordinat bul
  // Google Maps HTML'inde data-result-index veya aria-label kullanılır
  const nameRe    = /aria-label="([^"]{2,80})"[^>]*data-result-index/g;
  const coordRe   = /!3d([\d.]+)!4d([\d.]+)/g;
  const ratingRe  = /aria-label="([0-9],[0-9]) y[ıi]ld[ıi]z/g;
  const reviewRe  = /aria-label="([0-9,.]+) yorum/g;
  const placeRe   = /\/maps\/place\/[^\/]+\/@[\d.,]+\/[^"]+!1s([^!&"]+)/g;

  // Koordinatları bir kez topla
  const coords = [];
  let cm;
  while ((cm = coordRe.exec(html)) !== null) {
    coords.push({ lat: parseFloat(cm[1]), lng: parseFloat(cm[2]) });
  }

  // PlaceID'leri topla
  const placeIds = [];
  let pm;
  while ((pm = placeRe.exec(html)) !== null) {
    if (!placeIds.includes(pm[1])) placeIds.push(pm[1]);
  }

  // Rating'leri topla
  const ratings = [];
  let rm;
  while ((rm = ratingRe.exec(html)) !== null) {
    ratings.push(parseFloat(rm[1].replace(',','.')));
  }

  // Review sayılarını topla
  const reviews = [];
  let rvm;
  while ((rvm = reviewRe.exec(html)) !== null) {
    reviews.push(parseInt(rvm[1].replace(/\./g,'').replace(',','')));
  }

  // İsimleri topla
  const names = [];
  let nm;
  while ((nm = nameRe.exec(html)) !== null) {
    if (!names.includes(nm[1])) names.push(nm[1]);
  }

  // Eşleştir
  for (let i = 0; i < names.length; i++) {
    results.push({
      name        : names[i],
      rating      : ratings[i] || null,
      reviewCount : reviews[i] || 0,
      lat         : coords[i]?.lat || null,
      lng         : coords[i]?.lng || null,
      googlePlaceId: placeIds[i] || null,
      address     : null,
      priceRange  : null,
      sponsored   : false,
    });
  }

  return results.filter(b => b.name.length > 1);
}

// Daha güvenilir parse: Playwright ile evaluate() — DOM'dan doğrudan oku
async function parseFromPage(page) {
  return await page.evaluate(() => {
    const results = [];
    // Google Maps'te her işletme kartı [role="article"] veya [jsaction*="mouseover"] içinde
    const cards = document.querySelectorAll('[role="feed"] > div > div[jsaction]');

    cards.forEach(card => {
      const nameEl   = card.querySelector('[aria-label]');
      const name     = nameEl?.getAttribute('aria-label') || card.querySelector('.fontHeadlineSmall')?.textContent?.trim();
      if (!name || name.length < 2) return;

      const ratingEl = card.querySelector('[role="img"]');
      const ratingStr = ratingEl?.getAttribute('aria-label') || '';
      const ratingMatch = ratingStr.match(/([0-9],[0-9])/);
      const rating = ratingMatch ? parseFloat(ratingMatch[1].replace(',','.')) : null;

      const reviewEl = card.querySelector('[aria-label*="yorum"]');
      const reviewStr = reviewEl?.getAttribute('aria-label') || '';
      const reviewMatch = reviewStr.match(/([0-9.,]+)/);
      const reviewCount = reviewMatch ? parseInt(reviewMatch[1].replace(/\./g,'')) : 0;

      // Koordinat ve placeId URL'den
      const link = card.querySelector('a[href*="/maps/place/"]');
      const href = link?.href || '';
      const coordM  = href.match(/!3d([\d.]+)!4d([\d.]+)/);
      const placeM  = href.match(/!1s([^!&]+)/);

      results.push({
        name,
        rating,
        reviewCount,
        lat          : coordM ? parseFloat(coordM[1]) : null,
        lng          : coordM ? parseFloat(coordM[2]) : null,
        googlePlaceId: placeM ? placeM[1] : null,
        address      : null,
        priceRange   : null,
        sponsored    : false,
      });
    });

    return results;
  });
}

// ─── TEK JOB ─────────────────────────────────────────────────────────────────

async function runJob(page, job) {
  const url = `https://www.google.com/maps/search/${encodeURIComponent(job.query)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await sleep(CFG.NAVIGATE_WAIT);

  // Türkçe consent popup varsa kapat
  try {
    const consent = page.locator('button:has-text("Kabul et")');
    if (await consent.isVisible({ timeout: 2000 })) await consent.click();
  } catch {}

  // Scroll ile daha fazla sonuç yükle
  const seenNames = new Set();
  let businesses = [];

  for (let scroll = 0; scroll <= CFG.MAX_SCROLLS; scroll++) {
    const parsed = await parseFromPage(page);
    let newCount = 0;
    for (const b of parsed) {
      if (!seenNames.has(b.name)) {
        seenNames.add(b.name);
        businesses.push(b);
        newCount++;
      }
    }

    if (scroll === 0 && businesses.length === 0) break; // sonuç yok
    if (scroll > 0 && newCount === 0) break;            // yeni sonuç gelmiyor

    if (scroll < CFG.MAX_SCROLLS) {
      // Feed'in sonuna scroll
      await page.evaluate(() => {
        const feed = document.querySelector('[role="feed"]');
        if (feed) feed.scrollTop = feed.scrollHeight;
        else window.scrollTo(0, document.body.scrollHeight);
      });
      await sleep(CFG.SCROLL_WAIT);
    }
  }

  return businesses;
}

// ─── WORKER ──────────────────────────────────────────────────────────────────

// auto-scraper.cjs'den import fonksiyonlarını yeniden kullan
const { importToDB: _importToDB } = (() => {
  try { return require('./auto-scraperv8.cjs'); } catch { return {}; }
})();

// Eğer import edilemiyorsa burada inline importToDB kullan
// (auto-scraper.cjs'de module.exports yoksa aşağıdakini kullan)
async function importBusinesses(businesses, job) {
  if (_importToDB) return _importToDB(businesses, job);
  // Fallback: auto-scraper.cjs'e module.exports ekle ve buraya import et
  console.warn('⚠️  importToDB bulunamadı — auto-scraper.cjs sonuna şunu ekle:\nmodule.exports = { importToDB, getCategorySlugFromQuery };');
  return { added: 0, updated: 0, skipped: businesses.length };
}

async function worker(wIdx, queue, opts) {
  const { il, ilce } = opts;
  let processed = 0, added = 0;

  // Her worker kendi browser'ını açar
  const browser = await chromium.launch({
    headless: CFG.HEADLESS,
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--lang=tr-TR',
    ],
  });

  const context = await browser.newContext({
    locale: 'tr-TR',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();

  try {
    while (true) {
      const job = queue.claimJob(il, ilce);
      if (!job) break;

      process.stdout.write(`  [W${wIdx}] 🔍 ${job.query} (${job.ilce}) ... `);

      try {
        const businesses = await runJob(page, job);

        if (businesses.length === 0) {
          process.stdout.write('⚠️  sonuç yok\n');
          queue.done(job.id, 0);
        } else {
          const stats = await importBusinesses(businesses, job);
          process.stdout.write(`✅ ${businesses.length} bulundu → ${stats.added} yeni\n`);
          queue.done(job.id, businesses.length);
          added += stats.added;
        }
        processed++;
      } catch (e) {
        process.stdout.write(`❌ ${e.message}\n`);
        queue.fail(job.id, e.message);
        // Sayfa hatalıysa yeni sayfa aç
        try { await page.goto('about:blank'); } catch {}
      }

      await rndDelay();
    }
  } finally {
    await browser.close();
  }

  return { wIdx, processed, added };
}

// ─── ANA DÖNGÜ ────────────────────────────────────────────────────────────────

async function run(opts = {}) {
  const { workerCount = 3, il = null, ilce = null } = opts;

  const queue = new JobQueue();
  const pending = queue.pending(il, ilce);

  console.log(`\n🚀 Playwright Paralel Scraper`);
  console.log(`   Worker sayısı : ${workerCount}`);
  console.log(`   Bekleyen job  : ${pending}`);
  console.log(`   Tahmini süre  : ~${Math.ceil(pending / workerCount / 30)} dk\n`);

  const start = Date.now();

  const workers = Array.from({ length: workerCount }, (_, i) =>
    worker(i + 1, queue, { il, ilce })
  );

  const results = await Promise.all(workers);
  queue.close();

  const elapsed = ((Date.now() - start) / 1000 / 60).toFixed(1);
  const total = results.reduce((s, r) => ({ p: s.p + r.processed, a: s.a + r.added }), { p: 0, a: 0 });

  console.log(`\n═══════════════════════════════`);
  console.log(`✅ Tamamlandı — ${elapsed} dakika`);
  console.log(`   İşlenen job   : ${total.p}`);
  console.log(`   Yeni işletme  : ${total.a}`);
  console.log(`   Hız           : ${(total.p / elapsed).toFixed(1)} job/dk`);
  console.log(`═══════════════════════════════\n`);
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const get = f => { const i = args.indexOf(f); return i !== -1 ? args[i+1] : null; };

  const workerCount = parseInt(get('--workers') || '3');
  const il   = get('--il');
  const ilce = get('--ilce');

  if (cmd === 'run') {
    await run({ workerCount, il, ilce });
  } else if (cmd === 'test') {
    // 1 worker, 1 job, görünür browser
    CFG.HEADLESS = false;
    const queue = new JobQueue();
    const job = queue.claimJob(il, ilce);
    if (!job) { console.log('Pending job yok.'); queue.close(); return; }
    console.log(`\n🧪 Test: ${job.query}`);
    const browser = await chromium.launch({ headless: false });
    const page = await (await browser.newContext({ locale: 'tr-TR' })).newPage();
    const biz = await runJob(page, job);
    console.log(`Bulunan: ${biz.length}`, biz.slice(0,3));
    queue.fail(job.id, 'test — manuel reset gerekli');
    await browser.close();
    queue.close();
  } else {
    console.log(`
🦞 playwright-scraper.cjs

  node scraper/playwright-scraper.cjs run                   3 worker (varsayılan)
  node scraper/playwright-scraper.cjs run --workers 5       5 paralel worker
  node scraper/playwright-scraper.cjs run --workers 5 --il istanbul
  node scraper/playwright-scraper.cjs test                  görünür browser ile test
`);
  }
}

main()
  .catch(e => { console.error('❌', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
