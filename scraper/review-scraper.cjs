/**
 * review-scraper.cjs — v1
 * Google yorumlarını çeker: yazar, puan, içerik, fotoğraf, profil URL, işletme yanıtı
 *
 * Bilgisayar 2 çalıştırır (Bilgisayar 1 detail-scraper çalıştırırken)
 * İkisi aynı DB'ye yazar — çakışma yok (farklı tablolar)
 *
 * Kullanım:
 *   node scraper/review-scraper.cjs run --workers 5
 *   node scraper/review-scraper.cjs run --workers 5 --il istanbul
 *   node scraper/review-scraper.cjs run --workers 5 --reset
 *   node scraper/review-scraper.cjs status
 *   node scraper/review-scraper.cjs test --id <businessId>
 */

'use strict';

const { chromium }     = require('playwright');
const { PrismaClient } = require('@prisma/client');
const Database         = require('better-sqlite3');
const path             = require('path');

const prisma   = new PrismaClient();
const QUEUE_DB = path.join(__dirname, '..', 'memory', 'review-queue.db');

// ─── KONFİGÜRASYON ───────────────────────────────────────────────────────────

const CFG = {
  NAVIGATE_WAIT     : 1500,
  ACTION_WAIT       : 800,
  SCROLL_WAIT       : 600,
  MORE_BTN_WAIT     : 250,
  MIN_DELAY         : 300,
  MAX_DELAY         : 600,
  HEADLESS          : true,
  MAX_SCROLL        : 6,
};

// ─── KOORDİNAT EŞLEŞME ───────────────────────────────────────────────────────

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function rndDelay() { return sleep(CFG.MIN_DELAY + Math.random() * (CFG.MAX_DELAY - CFG.MIN_DELAY)); }

// ─── TARİH PARSE ─────────────────────────────────────────────────────────────

function parseRelativeDate(str) {
  if (!str) return null;
  const now = new Date();
  const map = [
    [/(\d+)\s*(dakika|minute)/i,  n => new Date(now - n * 60000)],
    [/(\d+)\s*(saat|hour)/i,      n => new Date(now - n * 3600000)],
    [/(\d+)\s*(gün|day)/i,        n => new Date(now - n * 86400000)],
    [/(\d+)\s*(hafta|week)/i,     n => new Date(now - n * 604800000)],
    [/(\d+)\s*(ay|month)/i,       n => new Date(now - n * 2592000000)],
    [/(\d+)\s*(yıl|year)/i,       n => new Date(now - n * 31536000000)],
    [/bir\s*(dakika|minute)/i,    () => new Date(now - 60000)],
    [/bir\s*(saat|hour)/i,        () => new Date(now - 3600000)],
    [/bir\s*(gün|day)/i,          () => new Date(now - 86400000)],
    [/bir\s*(hafta|week)/i,       () => new Date(now - 604800000)],
    [/bir\s*(ay|month)/i,         () => new Date(now - 2592000000)],
    [/bir\s*(yıl|year)/i,         () => new Date(now - 31536000000)],
  ];
  for (const [re, fn] of map) {
    const m = str.match(re);
    if (m) return fn(m[1] ? parseInt(m[1]) : 1);
  }
  return null;
}

// ─── QUEUE ────────────────────────────────────────────────────────────────────

class Queue {
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id   TEXT UNIQUE NOT NULL,
        status        TEXT DEFAULT 'pending',
        started_at    TEXT,
        done_at       TEXT,
        reviews_saved INTEGER DEFAULT 0,
        error         TEXT
      )
    `);
  }

  populate(ids) {
    const ins = this.db.prepare(`INSERT OR IGNORE INTO jobs (business_id) VALUES (?)`);
    this.db.transaction(ids => { for (const id of ids) ins.run(id); })(ids);
    return this.pendingCount();
  }

  claimJob() {
    return this.db.transaction(() => {
      const job = this.db.prepare(`SELECT * FROM jobs WHERE status='pending' ORDER BY id ASC LIMIT 1`).get();
      if (!job) return null;
      const ok = this.db.prepare(`UPDATE jobs SET status='running', started_at=? WHERE id=? AND status='pending'`).run(new Date().toISOString(), job.id).changes;
      return ok ? job : null;
    })();
  }

  done(id, saved)  { this.db.prepare(`UPDATE jobs SET status='done', done_at=?, reviews_saved=? WHERE id=?`).run(new Date().toISOString(), saved, id); }
  fail(id, err)    { this.db.prepare(`UPDATE jobs SET status='failed', error=? WHERE id=?`).run(String(err).slice(0, 400), id); }
  reset()          { this.db.prepare(`DELETE FROM jobs`).run(); }
  close()          { this.db.close(); }
  pendingCount()   { return this.db.prepare(`SELECT COUNT(*) as c FROM jobs WHERE status='pending'`).get().c; }
  totalCount()     { return this.db.prepare(`SELECT COUNT(*) as c FROM jobs`).get().c; }
  counts()         { return this.db.prepare(`SELECT status, COUNT(*) as c FROM jobs GROUP BY status`).all().reduce((a, r) => { a[r.status] = r.c; return a; }, {}); }
}

// ─── URL ──────────────────────────────────────────────────────────────────────

function buildUrl(business) {
  // Sadece ChIJ (base64) format place_id URL'de çalışır
  // 0x... (hex) format çalışmaz — arama URL'si kullan
  if (business.googlePlaceId?.startsWith('ChIJ')) {
    return `https://www.google.com/maps/place/?q=place_id:${business.googlePlaceId}`;
  }
  const q = [business.name, business.district, business.city].filter(Boolean).join(' ').normalize('NFC');
  return `https://www.google.com/maps/search/${encodeURIComponent(q)}`;
}

// ─── ARAMA LİSTESİNDEN GEÇ ───────────────────────────────────────────────────

// ─── ARAMA LİSTESİNDEN GEÇ ───────────────────────────────────────────────────

async function navigateToPlace(page, business) {
  const isList = await page.locator('[role="feed"]').isVisible({ timeout: 1000 }).catch(() => false);
  if (!isList) {
    const url = page.url();
    return url.includes('/maps/place/') || url.includes('place_id');
  }

  const bizName  = business.name.toLowerCase().normalize('NFC');
  const bizWords = bizName.split(/\s+/).filter(w => w.length > 2);

  const results = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.Nv2PK, [role="article"]')).map(card => {
      const nameEl = card.querySelector('.qBF1Pd, .fontHeadlineSmall, [class*="fontHeadline"]');
      const link   = card.querySelector('a[href*="/maps/place/"]');
      const href   = link?.href || '';
      const coordM = href.match(/@([\d.]+),([\d.]+),/);
      return {
        name : (nameEl?.textContent?.trim() || '').toLowerCase(),
        href,
        lat  : coordM ? parseFloat(coordM[1]) : null,
        lng  : coordM ? parseFloat(coordM[2]) : null,
      };
    }).filter(r => r.href);
  });

  if (!results.length) return false;

  let targetHref = null;

  if (business.latitude && business.longitude) {
    for (const r of results) {
      if (!r.lat || !r.lng) continue;
      const dist = haversineKm(business.latitude, business.longitude, r.lat, r.lng);
      if (dist <= 0.5) { targetHref = r.href; break; }
    }
  }

  if (!targetHref) {
    const byName = results.find(r =>
      bizWords.every(w => r.name.includes(w)) || bizWords.some(w => r.name.includes(w))
    );
    if (byName) targetHref = byName.href;
  }

  if (!targetHref) targetHref = results[0].href;

  await page.goto(targetHref, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await sleep(CFG.NAVIGATE_WAIT);

  const finalUrl = page.url();
  return finalUrl.includes('/maps/place/') || finalUrl.includes('place_id');
}

// ─── YORUM PARSE ─────────────────────────────────────────────────────────────

async function parseReviews(page, parseSrc) {
  return await page.evaluate((src) => {
    const parseRelativeDate = eval(`(${src})`); // eslint-disable-line no-eval
    const reviews = [];

    let cards = [];
    for (const sel of ['[data-review-id]', '.jftiEf', '[jscontroller][jsshadow]']) {
      cards = Array.from(document.querySelectorAll(sel));
      if (cards.length) break;
    }

    for (const card of cards) {
      // ── Yazar ──────────────────────────────────────────────────────────────
      const nameEl = card.querySelector('.d4r55, [class*="d4r55"], .WNxzHc a');
      const authorName = nameEl?.textContent?.trim();
      if (!authorName || authorName.length < 2) continue;

      // Yazar profil URL
      const profileLink = card.querySelector('a[href*="contrib"], a[href*="/maps/contrib/"]');
      const authorProfileUrl = profileLink?.href || null;

      // Yazar fotoğrafı
      const photoImg = card.querySelector('.NBa7we img, [class*="NBa7we"] img');
      const authorPhoto = photoImg?.src || null;

      // ── Puan ───────────────────────────────────────────────────────────────
      const ratingEl = card.querySelector('[role="img"][aria-label*="yıldız"], [role="img"][aria-label*="star"]');
      const ratingMatch = (ratingEl?.getAttribute('aria-label') || '').match(/(\d)/);
      const rating = ratingMatch ? parseInt(ratingMatch[1]) : null;
      if (!rating) continue;

      // ── Tarih ──────────────────────────────────────────────────────────────
      const dateEl = card.querySelector('.rsqaWe, [class*="rsqaWe"], .xRkPPb');
      const dateStr = dateEl?.textContent?.trim() || null;
      const publishedAt = parseRelativeDate(dateStr);

      // ── İçerik ─────────────────────────────────────────────────────────────
      const contentEl = card.querySelector('.wiI7pd, [class*="wiI7pd"], [jsname="fbQN7e"], [jsname="NWVtK"]');
      const content = contentEl?.textContent?.trim() || null;

      // ── Yerel Rehber ───────────────────────────────────────────────────────
      const lgEl = card.querySelector('.RfnDt, [class*="RfnDt"]');
      const lgText = lgEl?.textContent?.trim() || '';
      let authorLevel = null, authorReviewCount = null;
      if (lgText.includes('Yerel Rehber') || lgText.includes('Local Guide')) {
        authorLevel = 'Yerel Rehber';
        const lvlM = lgText.match(/Seviye\s*(\d+)/i) || lgText.match(/Level\s*(\d+)/i);
        if (lvlM) authorLevel = `Yerel Rehber · Seviye ${lvlM[1]}`;
        const rcM = lgText.match(/([\d.]+)\s*yorum/) || lgText.match(/([\d,]+)\s*review/);
        if (rcM) authorReviewCount = parseInt(rcM[1].replace(/[.,]/g, ''));
      }

      // ── Yorum fotoğrafları ─────────────────────────────────────────────────
      const photoEls = card.querySelectorAll('button[jsaction*="photo"] img, .Tya61d img, [class*="Tya61d"] img');
      const photos = Array.from(photoEls).map(img => img.src).filter(src => src?.startsWith('http'));

      // ── İşletme sahibi yanıtı ──────────────────────────────────────────────
      const replyEl = card.querySelector('.CDe7pd, [class*="CDe7pd"]');
      const ownerReply = replyEl?.textContent?.trim() || null;

      // Yanıt tarihi
      const replyDateEl = card.querySelector('.pi8uOe, [class*="pi8uOe"]');
      const ownerReplyDate = replyDateEl ? parseRelativeDate(replyDateEl.textContent?.trim()) : null;

      reviews.push({
        authorName,
        authorProfileUrl,
        authorPhoto,
        authorLevel,
        authorReviewCount,
        rating,
        content,
        publishedAt: publishedAt?.toISOString() || null,
        photos: photos.length ? photos : null,
        ownerReply,
        ownerReplyDate: ownerReplyDate?.toISOString() || null,
      });
    }

    return reviews;
  }, parseSrc);
}

// ─── KAYDET ───────────────────────────────────────────────────────────────────

async function saveReviews(page, business, pageUrl, parseSrc) {
  // "Daha fazla göster" butonlarını aç
  const moreBtns = page.locator('button[aria-label*="Daha fazla"], button:has-text("Daha fazla göster")');
  const btnCount = await moreBtns.count().catch(() => 0);
  for (let i = 0; i < btnCount; i++) {
    try { await moreBtns.nth(i).click(); await sleep(CFG.MORE_BTN_WAIT); } catch {}
  }

  const reviews = await parseReviews(page, parseSrc);
  let saved = 0;

  for (const r of reviews) {
    const contentKey = (r.content || '').substring(0, 80).replace(/\s+/g, ' ').trim();
    const sourceId   = `${business.id}_${r.authorName}_${contentKey}`.substring(0, 190);
    try {
      await prisma.externalReview.upsert({
        where:  { source_sourceId: { source: 'GOOGLE', sourceId } },
        update: {
          rating           : r.rating,
          content          : r.content,
          authorLevel      : r.authorLevel,
          authorReviewCount: r.authorReviewCount,
          authorPhoto      : r.authorPhoto,
          authorProfileUrl : r.authorProfileUrl,
          publishedAt      : r.publishedAt ? new Date(r.publishedAt) : null,
          photos           : r.photos || [],
          ownerReply       : r.ownerReply,
          ownerReplyDate   : r.ownerReplyDate ? new Date(r.ownerReplyDate) : null,
          updatedAt        : new Date(),
        },
        create: {
          businessId       : business.id,
          source           : 'GOOGLE',
          sourceId,
          sourceUrl        : pageUrl,
          authorName       : r.authorName,
          authorPhoto      : r.authorPhoto,
          authorProfileUrl : r.authorProfileUrl,
          authorLevel      : r.authorLevel,
          authorReviewCount: r.authorReviewCount,
          rating           : r.rating,
          content          : r.content,
          publishedAt      : r.publishedAt ? new Date(r.publishedAt) : null,
          photos           : r.photos || [],
          ownerReply       : r.ownerReply,
          ownerReplyDate   : r.ownerReplyDate ? new Date(r.ownerReplyDate) : null,
          language         : 'tr',
        },
      });
      saved++;
    } catch {}
  }
  return { saved, total: reviews.length };
}

// ─── TEK İŞLETME ─────────────────────────────────────────────────────────────

async function scrapeOne(page, business) {
  const parseSrc = parseRelativeDate.toString();

  await page.goto(buildUrl(business), { waitUntil: 'domcontentloaded', timeout: 25000 });
  await sleep(CFG.NAVIGATE_WAIT);

  // Arama listesindeyse işletmeye geç
  await navigateToPlace(page, business);

  // URL kaydet (navigate sonrası — SPA'da page.url() güvenilmez)
  const urlBeforeReload = page.url();

  // Google Maps SPA: F5 gibi reload — sekmeler tam yüklenir
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
  await sleep(CFG.NAVIGATE_WAIT);
  await page.waitForSelector('button.hh2c6, [role="tab"]', { timeout: 6000 }).catch(() => {});
  await sleep(400);

  // Sekme var mı kontrol et — varsa place sayfasındayız
  const hasTab = await page.locator('button.hh2c6').count().catch(() => 0);
  if (!hasTab) return { status: 'not_found', reviewsSaved: 0 };

  const pageUrl = page.url();

  // Yorumlar sekmesi
  const tabSelectors = [
    'button[aria-label*="ile ilgili yorumlar"]',
    'button[aria-label*="Yorumlar"]',
    '[role="tab"]:has-text("Yorumlar")',
    'button:has-text("Yorumlar")',
  ];

  let tabFound = false;
  // Yorumlar sekmesi — dispatchEvent ile tıkla (jsaction tabları için)
  // aria-label: "İşletme adı ile ilgili yorumlar"
  const yorumBtn = page.locator('button.hh2c6[aria-label*="yorumlar"], button.hh2c6[aria-label*="reviews"]').first();
  if (await yorumBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await yorumBtn.dispatchEvent('click');
    await sleep(CFG.ACTION_WAIT);
    tabFound = true;
  }

  // Fallback: data-tab-index="1" (Yorumlar her zaman 2. sekme)
  if (!tabFound) {
    const byIndex = page.locator('button.hh2c6[data-tab-index="1"]').first();
    if (await byIndex.isVisible({ timeout: 1000 }).catch(() => false)) {
      await byIndex.dispatchEvent('click');
      await sleep(CFG.ACTION_WAIT);
      tabFound = true;
    }
  }

  if (!tabFound) return { status: 'no_reviews_tab', reviewsSaved: 0 };

  // Geçiş 1: En faydalı (varsayılan)
  const pass1 = await saveReviews(page, business, pageUrl, parseSrc);
  let totalSaved = pass1.saved;

  // Geçiş 2: En yeni
  const sortBtn = page.locator('button[aria-label*="En alakalı"], button[aria-label*="Sıralama"], button[aria-label*="sırala"]').first();
  if (await sortBtn.isVisible({ timeout: 800 }).catch(() => false)) {
    await sortBtn.click();
    await sleep(CFG.ACTION_WAIT);

    const newestOpt = page.locator('[role="menuitemradio"]:has-text("En yeni"), [role="option"]:has-text("En yeni"), [role="menuitem"]:has-text("En yeni")').first();
    if (await newestOpt.isVisible({ timeout: 1500 }).catch(() => false)) {
      await newestOpt.click();
      await sleep(CFG.ACTION_WAIT);

      // Scroll
      for (let s = 0; s < CFG.MAX_SCROLL; s++) {
        await page.evaluate(() => {
          const f = document.querySelector('[role="feed"]');
          if (f) f.scrollTop = f.scrollHeight; else window.scrollTo(0, document.body.scrollHeight);
        });
        await sleep(CFG.SCROLL_WAIT);
      }

      const pass2 = await saveReviews(page, business, pageUrl, parseSrc);
      totalSaved += pass2.saved;
    }
  }

  return { status: 'ok', reviewsSaved: totalSaved };
}

// ─── WORKER ──────────────────────────────────────────────────────────────────

async function runWorker(wIdx, queue, state) {
  const browser = await chromium.launch({
    headless: CFG.HEADLESS,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--lang=tr-TR', '--mute-audio'],
  });
  const ctx = await browser.newContext({
    locale: 'tr-TR',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });
  await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => undefined }));
  const page = await ctx.newPage();

  await page.goto('https://www.google.com/maps', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  try {
    const c = page.locator('button:has-text("Kabul et"), button:has-text("Accept all")').first();
    if (await c.isVisible({ timeout: 2000 })) { await c.click(); await sleep(500); }
  } catch {}

  try {
    while (true) {
      const job = queue.claimJob();
      if (!job) { state.workerStatus[wIdx] = '✅ tamamlandı'; break; }

      const biz = await prisma.business.findUnique({
        where: { id: job.business_id },
        select: { id: true, name: true, city: true, district: true, googlePlaceId: true, latitude: true, longitude: true },
      });

      if (!biz) { queue.done(job.id, 0); state.processed++; continue; }

      state.workerStatus[wIdx] = `💬 ${biz.name.substring(0, 28)}`;

      try {
        const result = await scrapeOne(page, biz);
        queue.done(job.id, result.reviewsSaved);
        state.totalReviews += result.reviewsSaved;
        state.processed++;
      } catch (e) {
        queue.fail(job.id, e.message);
        state.errors++;
        state.processed++;
        await page.goto('about:blank', { timeout: 5000 }).catch(() => {});
      }

      await rndDelay();
    }
  } finally {
    await browser.close();
  }
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

function renderDashboard(state) {
  const { il, workerCount, startTotal, processed, totalReviews, errors, start, workerStatus } = state;
  const elapsed = (Date.now() - start) / 1000 / 60;
  const rate    = elapsed > 0.05 ? (processed / elapsed).toFixed(1) : '...';
  const rem     = startTotal - processed;
  const eta     = rate !== '...' && +rate > 0 ? Math.ceil(rem / +rate) : '?';
  const pct     = startTotal > 0 ? ((processed / startTotal) * 100).toFixed(1) : '0.0';
  const filled  = Math.round(processed / Math.max(startTotal, 1) * 30);
  const bar     = '█'.repeat(filled) + '░'.repeat(Math.max(0, 30 - filled));

  process.stdout.write('\x1b[2J\x1b[H');
  const lines = [
    `╔══════════════════════════════════════════════════╗`,
    `║       💬 TECRUBELERIM REVIEW SCRAPER             ║`,
    `╠══════════════════════════════════════════════════╣`,
    `║  İl filtresi : ${(il || 'Tümü').padEnd(33)}║`,
    `║  Worker      : ${String(workerCount).padEnd(33)}║`,
    `╠══════════════════════════════════════════════════╣`,
    `║  İlerleme    : [${bar}] ${pct}%  ║`,
    `║  İşlenen     : ${String(processed).padEnd(10)} / ${String(startTotal).padEnd(20)}║`,
    `║  Yorum toplamı: ${String(totalReviews).padEnd(32)}║`,
    `║  Hata        : ${String(errors).padEnd(33)}║`,
    `╠══════════════════════════════════════════════════╣`,
    `║  Hız         : ${(rate + ' işletme/dk').padEnd(33)}║`,
    `║  Geçen süre  : ${(elapsed.toFixed(1) + ' dk').padEnd(33)}║`,
    `║  Kalan süre  : ${(eta + ' dk (~' + (eta / 60).toFixed(1) + ' saat)').padEnd(33)}║`,
    `╠══════════════════════════════════════════════════╣`,
    `║  WORKER DURUMU                                   ║`,
  ];
  for (const [i, s] of Object.entries(workerStatus)) {
    lines.push(`║  ${(`  W${i}: ${s}`).slice(0, 47).padEnd(47)} ║`);
  }
  lines.push(`╚══════════════════════════════════════════════════╝`);
  lines.push(`  Son güncelleme: ${new Date().toLocaleTimeString('tr-TR')}`);
  console.log(lines.join('\n'));
}

// ─── RUN ─────────────────────────────────────────────────────────────────────

async function run(opts = {}) {
  const { workerCount = 5, il = null, reset = false } = opts;

  const where = { isActive: true, isDeleted: false };
  if (il) where.city = { contains: il, mode: 'insensitive' };

  const businesses = await prisma.business.findMany({ where, select: { id: true } });
  if (!businesses.length) { console.log('⚠️  İşletme bulunamadı.'); return; }

  const queue = new Queue(QUEUE_DB);
  if (reset) { queue.reset(); console.log('🔄 Queue sıfırlandı.'); }

  const pending = queue.populate(businesses.map(b => b.id));
  if (!pending) { console.log('✅ Tüm işletmeler işlenmiş. --reset ile tekrar.'); queue.close(); return; }

  const total  = queue.totalCount();
  const done   = total - pending;
  const state  = { il, workerCount, startTotal: total, processed: done, totalReviews: 0, errors: 0, start: Date.now(), workerStatus: {} };

  for (let i = 1; i <= workerCount; i++) state.workerStatus[i] = 'başlıyor...';

  const dash = setInterval(() => renderDashboard(state), 2000);
  renderDashboard(state);

  await Promise.all(Array.from({ length: workerCount }, (_, i) => runWorker(i + 1, queue, state)));

  clearInterval(dash);
  renderDashboard(state);

  const c = queue.counts();
  console.log(`\n🎉 Tamamlandı — done: ${c.done || 0}, failed: ${c.failed || 0}, yorum: ${state.totalReviews}`);
  queue.close();
}

// ─── STATUS ───────────────────────────────────────────────────────────────────

async function cmdStatus() {
  const total       = await prisma.externalReview.count({ where: { source: 'GOOGLE' } });
  const businesses  = await prisma.business.count();
  const withReviews = (await prisma.externalReview.groupBy({ by: ['businessId'] })).length;
  const withPhotos  = await prisma.externalReview.count({ where: { source: 'GOOGLE', NOT: { photos: { equals: [] } } } });

  console.log('\n=== Review Scraper Durumu ===');
  console.log(`Toplam işletme         : ${businesses}`);
  console.log(`Toplam Google yorumu   : ${total}`);
  console.log(`Yorumu olan işletme    : ${withReviews}`);
  console.log(`Fotoğraflı yorum       : ${withPhotos}`);

  try {
    const q = new Queue(QUEUE_DB);
    const c = q.counts();
    console.log('\nQueue:');
    for (const [s, n] of Object.entries(c)) console.log(`  ${s.padEnd(10)}: ${n}`);
    q.close();
  } catch {}

  if (total > 0) {
    const sample = await prisma.externalReview.findMany({
      take: 3, orderBy: { scrapedAt: 'desc' },
      select: { authorName: true, rating: true, content: true, authorProfileUrl: true },
    });
    console.log('\nSon 3 yorum:');
    sample.forEach(r => console.log(`  ⭐${r.rating} ${r.authorName}${r.authorProfileUrl ? ' 🔗' : ''} — ${(r.content || '(yalnızca puan)').substring(0, 50)}`));
  }
}

// ─── TEST ─────────────────────────────────────────────────────────────────────

async function cmdTest(args) {
  const id  = args[args.indexOf('--id') + 1];
  const biz = id
    ? await prisma.business.findUnique({ where: { id }, select: { id: true, name: true, city: true, district: true, googlePlaceId: true } })
    : await prisma.business.findFirst({ where: { isActive: true, isDeleted: false }, select: { id: true, name: true, city: true, district: true, googlePlaceId: true } });

  if (!biz) { console.error('İşletme bulunamadı.'); return; }
  console.log(`\n🧪 Test: ${biz.name} (${biz.city})`);
  CFG.HEADLESS = false;

  const browser = await chromium.launch({ headless: false, args: ['--lang=tr-TR', '--no-sandbox'] });
  const page    = await (await browser.newContext({ locale: 'tr-TR', viewport: { width: 1280, height: 800 } })).newPage();

  try {
    const result = await scrapeOne(page, biz);
    console.log('\n✅ Sonuç:', JSON.stringify(result, null, 2));

    if (result.reviewsSaved > 0) {
      const reviews = await prisma.externalReview.findMany({
        where: { businessId: biz.id, source: 'GOOGLE' },
        take: 3,
        orderBy: { scrapedAt: 'desc' },
        select: { authorName: true, rating: true, content: true, authorPhoto: true, authorProfileUrl: true, photos: true, ownerReply: true },
      });
      console.log('\n📋 Kaydedilen son yorumlar:');
      reviews.forEach((r, i) => console.log(`\n  ${i+1}. ⭐${r.rating} — ${r.authorName}${r.authorProfileUrl ? '\n     🔗 '+r.authorProfileUrl : ''}${r.authorPhoto ? '\n     📸 Fotoğraf: '+r.authorPhoto.substring(0,60)+'...' : ''}${r.content ? '\n     💬 '+r.content.substring(0,80) : ''}${r.photos?.length ? '\n     🖼️  '+r.photos.length+' yorum fotoğrafı' : ''}${r.ownerReply ? '\n     🏪 Yanıt: '+r.ownerReply.substring(0,60) : ''}`));
    }

    console.log('\n⏸️  Enter\'a bas...');
    await new Promise(r => { process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.once('data', () => { process.stdin.setRawMode(false); r(); }); });
  } catch (e) {
    console.error('❌', e.message);
  } finally {
    await browser.close();
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const cmd  = args[0];
  const get  = f => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
  const has  = f => args.includes(f);

  switch (cmd) {
    case 'status': await cmdStatus(); break;
    case 'run':
      await run({ workerCount: parseInt(get('--workers') || '5'), il: get('--il'), reset: has('--reset') });
      break;
    case 'test': await cmdTest(args.slice(1)); break;
    default:
      console.log(`
💬 review-scraper.cjs

  node scraper/review-scraper.cjs status
  node scraper/review-scraper.cjs test
  node scraper/review-scraper.cjs test --id <id>
  node scraper/review-scraper.cjs run --workers 5
  node scraper/review-scraper.cjs run --workers 5 --il istanbul
  node scraper/review-scraper.cjs run --workers 5 --reset
`);
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); }).finally(() => prisma.$disconnect());
