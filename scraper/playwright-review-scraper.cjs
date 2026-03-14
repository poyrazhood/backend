/**
 * playwright-review-scraper.cjs — v2
 * Detay (phone/website/koordinat/hakkında) + yorumları çeker.
 * Playwright ile paralel N worker — her biri bağımsız Chromium açar.
 *
 * Kullanım:
 *   node scraper/playwright-review-scraper.cjs run --workers 5
 *   node scraper/playwright-review-scraper.cjs run --workers 5 --il mardin
 *   node scraper/playwright-review-scraper.cjs run --workers 5 --no-reviews   ← sadece detay
 *   node scraper/playwright-review-scraper.cjs run --workers 5 --reset        ← queue'yu sıfırla
 *   node scraper/playwright-review-scraper.cjs status
 *   node scraper/playwright-review-scraper.cjs test
 *   node scraper/playwright-review-scraper.cjs test --id <businessId>
 */

'use strict';

const { chromium }    = require('playwright');
const { PrismaClient } = require('@prisma/client');
const Database        = require('better-sqlite3');
const path            = require('path');

const prisma   = new PrismaClient();
const QUEUE_DB = path.join(__dirname, '..', 'memory', 'review-queue.db');

// ─── KONFİGÜRASYON ───────────────────────────────────────────────────────────

const CFG = {
  NAVIGATE_WAIT     : 1500,  // ms — sayfa yüklenme bekle
  ACTION_WAIT       : 800,   // ms — tıklama sonrası bekle
  SCROLL_WAIT       : 600,   // ms — scroll sonrası bekle
  MORE_BTN_WAIT     : 250,   // ms — "Daha fazla" butonları arası
  MIN_DELAY         : 300,   // ms — işletmeler arası min bekleme
  MAX_DELAY         : 600,   // ms — işletmeler arası max bekleme
  HEADLESS          : true,
  MAX_SCROLL_REVIEWS: 6,     // yorum listesi için max scroll
};

// ─── YARDIMCILAR ─────────────────────────────────────────────────────────────

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

// ─── PLAYWRIGHT DOM PARSE: YORUMLAR ──────────────────────────────────────────

async function parseReviewsFromPage(page) {
  return await page.evaluate((parseSrc) => {
    const parseRelativeDate = eval(`(${parseSrc})`); // eslint-disable-line no-eval

    const reviews = [];

    // Google Maps yorum kartları — birden fazla selector dene
    const selectors = ['[data-review-id]', '.jftiEf', '[jscontroller][jsshadow]'];
    let cards = [];
    for (const sel of selectors) {
      cards = Array.from(document.querySelectorAll(sel));
      if (cards.length > 0) break;
    }

    for (const card of cards) {
      // Yazar adı
      const nameEl = card.querySelector('.d4r55, [class*="d4r55"], .WNxzHc a, [href*="contrib"]');
      const authorName = nameEl?.textContent?.trim() || null;
      if (!authorName || authorName.length < 2) continue;

      // Puan
      const ratingEl = card.querySelector('[role="img"][aria-label*="yıldız"], [role="img"][aria-label*="star"]');
      const ratingStr = ratingEl?.getAttribute('aria-label') || '';
      const ratingMatch = ratingStr.match(/(\d)/);
      const rating = ratingMatch ? parseInt(ratingMatch[1]) : null;

      // Tarih
      const dateEl = card.querySelector('.rsqaWe, [class*="rsqaWe"], .xRkPPb, [class*="xRkPPb"]');
      const dateStr = dateEl?.textContent?.trim() || null;
      const publishedAt = parseRelativeDate(dateStr);

      // Yorum içeriği — "Daha fazla göster" sonrası tam metin
      const contentEl = card.querySelector('.wiI7pd, [class*="wiI7pd"], [jsname="fbQN7e"], [jsname="NWVtK"]');
      const content = contentEl?.textContent?.trim() || null;

      // Yerel Rehber
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

      // İşletme sahibi yanıtı
      const replyEl = card.querySelector('.CDe7pd, [class*="CDe7pd"]');
      const ownerReply = replyEl?.textContent?.trim() || null;

      // Sadece puan olmayan yorumları filtrele: rating şart, content opsiyonel
      if (!rating) continue;

      reviews.push({
        authorName,
        authorLevel,
        authorReviewCount,
        rating,
        content: content || null,  // sadece puan da olsa kaydet
        publishedAt: publishedAt ? publishedAt.toISOString() : null,
        ownerReply,
      });
    }

    return reviews;
  }, parseRelativeDate.toString());
}

// ─── PLAYWRIGHT DOM PARSE: DETAY ─────────────────────────────────────────────

async function parseBusinessDetailFromPage(page) {
  return await page.evaluate(() => {
    const detail = {};

    // Telefon
    const phoneLink = document.querySelector('a[href^="tel:"]');
    if (phoneLink) {
      detail.phoneNumber = phoneLink.getAttribute('href').replace('tel:', '').replace(/\s+/g, '');
    }

    // Website
    const allLinks = Array.from(document.querySelectorAll('a[href]'));
    for (const a of allLinks) {
      const href = a.getAttribute('href') || '';
      if (
        href.startsWith('http') &&
        !href.includes('google') &&
        !href.includes('goo.gl') &&
        !href.includes('wa.me') &&
        !href.includes('maps') &&
        !href.includes('accounts') &&
        !href.includes('support') &&
        href.length > 10
      ) {
        detail.website = href;
        break;
      }
    }

    // Koordinat (URL'den)
    const url = window.location.href;
    const coordM = url.match(/@([\d.]+),([\d.]+),/);
    if (coordM) {
      detail.latitude  = parseFloat(coordM[1]);
      detail.longitude = parseFloat(coordM[2]);
    }

    // Google Place ID
    const placeM = url.match(/!1s(0x[^!:]+:[^!&"]+)/);
    if (placeM) detail.googlePlaceId = placeM[1];

    // Çalışma saatleri
    const hourRows = document.querySelectorAll('table[aria-label] tr, .y0skZc tr, [class*="y0skZc"] tr');
    const openingHours = [];
    for (const row of hourRows) {
      const cells = row.querySelectorAll('td, th');
      if (cells.length >= 2) {
        const day   = cells[0]?.textContent?.trim();
        const hours = cells[1]?.textContent?.trim();
        if (day && hours && day.length > 1) {
          const parts = hours.split('–');
          openingHours.push({
            day,
            openTime : parts[0]?.trim() || hours,
            closeTime: parts[1]?.trim() || '',
          });
        }
      }
    }
    if (openingHours.length > 0) detail.openingHours = openingHours;

    return detail;
  });
}

// ─── PLAYWRIGHT DOM PARSE: HAKKINDA ──────────────────────────────────────────

async function parseAboutFromPage(page) {
  return await page.evaluate(() => {
    const attributes = {};

    // Hakkında sekmesi: başlık (h2 / aria-level=2) → altındaki liste öğeleri
    const headings = document.querySelectorAll('[aria-level="2"], h2, .fontTitleSmall, [class*="fontTitleSmall"]');

    for (const heading of headings) {
      const groupName = heading.textContent?.trim();
      if (!groupName || groupName.length < 2 || groupName.length > 60) continue;

      const container = heading.closest('li, div')?.nextElementSibling
        || heading.parentElement?.nextElementSibling;
      if (!container) continue;

      const items = [];
      const itemEls = container.querySelectorAll('li, [role="listitem"]');
      for (const item of itemEls) {
        const text = item.textContent?.trim();
        if (text && text.length >= 2 && text.length <= 100 && !text.includes('©')) {
          if (!items.includes(text)) items.push(text);
        }
      }

      if (items.length > 0) attributes[groupName] = items;
    }

    // Fallback: aria-checked ile işaretli özellikler
    if (Object.keys(attributes).length === 0) {
      const checked = [];
      for (const el of document.querySelectorAll('[aria-checked="true"]')) {
        const label = el.getAttribute('aria-label') || el.textContent?.trim();
        if (label && label.length >= 2 && label.length <= 100 && !label.includes('©')) {
          checked.push(label);
        }
      }
      if (checked.length > 0) attributes['Özellikler'] = checked;
    }

    return attributes;
  });
}

// ─── GOOGLE MAPS URL BUILDER ──────────────────────────────────────────────────

function buildSearchUrl(business) {
  // googlePlaceId varsa direkt → arama adımı atlanır, çok daha hızlı
  if (business.googlePlaceId) {
    return `https://www.google.com/maps/place/?q=place_id:${business.googlePlaceId}`;
  }
  const q = [business.name, business.district, business.city]
    .filter(Boolean).join(' ').normalize('NFC');
  return `https://www.google.com/maps/search/${encodeURIComponent(q)}`;
}

// ─── TEK İŞLETME SCRAPE ──────────────────────────────────────────────────────

async function scrapeBusiness(page, business, opts = {}) {
  const { skipReviews = false } = opts;

  await page.goto(buildSearchUrl(business), { waitUntil: 'domcontentloaded', timeout: 25000 });
  await sleep(CFG.NAVIGATE_WAIT);

  // Arama listesindeyse doğru işletmeye tıkla
  const isSearchList = await page.locator('[role="feed"]').isVisible({ timeout: 800 }).catch(() => false);
  if (isSearchList) {
    const bizNameNorm = business.name.toLowerCase().normalize('NFC');
    const bizWords    = bizNameNorm.split(/\s+/).filter(w => w.length > 2);
    const articles    = page.locator('[role="feed"] a[href*="/maps/place/"]');
    const count       = await articles.count().catch(() => 0);

    let clicked = false;
    for (let i = 0; i < count; i++) {
      const el    = articles.nth(i);
      const label = ((await el.getAttribute('aria-label').catch(() => '')) || '').toLowerCase().normalize('NFC');
      if (
        label === bizNameNorm ||
        bizWords.every(w => label.includes(w)) ||
        bizWords.some(w => label.includes(w))
      ) {
        await el.click();
        await sleep(CFG.NAVIGATE_WAIT);
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      const first = articles.first();
      if (await first.isVisible({ timeout: 800 }).catch(() => false)) {
        await first.click();
        await sleep(CFG.NAVIGATE_WAIT);
      } else {
        return { detailUpdated: false, reviewsSaved: 0, status: 'not_found' };
      }
    }
  }

  // ─── DETAY ─────────────────────────────────────────────────────────────────
  const detail = await parseBusinessDetailFromPage(page);
  const detailUpdate = {};

  if (detail.phoneNumber   && !business.phoneNumber)   detailUpdate.phoneNumber   = detail.phoneNumber;
  if (detail.website       && !business.website)       detailUpdate.website       = detail.website;
  if (detail.latitude      && !business.latitude)      detailUpdate.latitude      = detail.latitude;
  if (detail.longitude     && !business.longitude)     detailUpdate.longitude     = detail.longitude;
  if (detail.googlePlaceId && !business.googlePlaceId) detailUpdate.googlePlaceId = detail.googlePlaceId;

  if (Object.keys(detailUpdate).length > 0) {
    await prisma.business.update({ where: { id: business.id }, data: detailUpdate });
  }

  if (detail.openingHours?.length > 0) {
    for (const h of detail.openingHours) {
      await prisma.openingHours.upsert({
        where:  { id: `${business.id}_${h.day}` },
        update: { openTime: h.openTime, closeTime: h.closeTime },
        create: { id: `${business.id}_${h.day}`, businessId: business.id, day: h.day, openTime: h.openTime, closeTime: h.closeTime },
      }).catch(() => {});
    }
  }

  // ─── HAKKINDA ──────────────────────────────────────────────────────────────
  const aboutTab = page.locator(
    'button[aria-label*="Hakkında"], [role="tab"]:has-text("Hakkında"), button:has-text("Hakkında")'
  );
  const aboutVis = await aboutTab.first().isVisible({ timeout: 800 }).catch(() => false);

  if (aboutVis) {
    await aboutTab.first().click();
    await sleep(CFG.ACTION_WAIT);

    const aboutData = await parseAboutFromPage(page);
    if (Object.keys(aboutData).length > 0) {
      const existing = (business.attributes && typeof business.attributes === 'object')
        ? business.attributes : {};
      await prisma.business.update({
        where: { id: business.id },
        data:  { attributes: { ...existing, about: aboutData } },
      });
    }

    // Genel Bakış'a dön
    const overviewTab = page.locator(
      'button[aria-label*="Genel Bakış"], [role="tab"]:has-text("Genel Bakış")'
    );
    if (await overviewTab.first().isVisible({ timeout: 800 }).catch(() => false)) {
      await overviewTab.first().click();
      await sleep(CFG.ACTION_WAIT);
    }
  }

  if (skipReviews) {
    return { detailUpdated: Object.keys(detailUpdate).length > 0, reviewsSaved: 0, status: 'ok' };
  }

  // ─── YORUMLAR ──────────────────────────────────────────────────────────────
  const pageUrl = page.url();

  async function saveCurrentReviews() {
    // "Daha fazla göster" butonlarını aç
    const moreBtns = page.locator('button[aria-label*="Daha fazla"], button:has-text("Daha fazla göster")');
    const btnCount = await moreBtns.count().catch(() => 0);
    for (let i = 0; i < btnCount; i++) {
      try { await moreBtns.nth(i).click(); await sleep(CFG.MORE_BTN_WAIT); } catch {}
    }

    const reviews = await parseReviewsFromPage(page);
    let saved = 0;

    for (const r of reviews) {
      const contentKey = (r.content || '').substring(0, 80).replace(/\s+/g, ' ').trim();
      const sourceId   = `${business.id}_${r.authorName}_${contentKey}`.substring(0, 190);
      try {
        await prisma.externalReview.upsert({
          where:  { source_sourceId: { source: 'GOOGLE', sourceId } },
          update: {
            rating: r.rating, content: r.content,
            authorLevel: r.authorLevel, authorReviewCount: r.authorReviewCount,
            publishedAt: r.publishedAt ? new Date(r.publishedAt) : null,
            ownerReply: r.ownerReply, updatedAt: new Date(),
          },
          create: {
            businessId: business.id, source: 'GOOGLE', sourceId, sourceUrl: pageUrl,
            authorName: r.authorName, authorLevel: r.authorLevel,
            authorReviewCount: r.authorReviewCount, rating: r.rating,
            content: r.content,
            publishedAt: r.publishedAt ? new Date(r.publishedAt) : null,
            ownerReply: r.ownerReply,
          },
        });
        saved++;
      } catch {}
    }
    return { saved, total: reviews.length };
  }

  // Yorumlar sekmesi
  const reviewTab = page.locator(
    'button[aria-label*="ile ilgili yorumlar"], button[aria-label*="Yorumlar"], [role="tab"]:has-text("Yorumlar")'
  );
  if (!await reviewTab.first().isVisible({ timeout: 1500 }).catch(() => false)) {
    return { detailUpdated: Object.keys(detailUpdate).length > 0, reviewsSaved: 0, status: 'no_reviews_tab' };
  }

  await reviewTab.first().click();
  await sleep(CFG.ACTION_WAIT);

  // Geçiş 1: En faydalı (varsayılan)
  const pass1 = await saveCurrentReviews();
  let totalSaved = pass1.saved;

  // Geçiş 2: En yeni
  const sortBtn = page.locator(
    'button[aria-label*="En alakalı"], button[aria-label*="Sıralama"], button[aria-label*="sırala"]'
  );
  if (await sortBtn.first().isVisible({ timeout: 800 }).catch(() => false)) {
    await sortBtn.first().click();
    await sleep(CFG.ACTION_WAIT);

    const newestOpt = page.locator(
      '[role="menuitemradio"]:has-text("En yeni"), [role="option"]:has-text("En yeni"), [role="menuitem"]:has-text("En yeni")'
    );
    if (await newestOpt.first().isVisible({ timeout: 1500 }).catch(() => false)) {
      await newestOpt.first().click();
      await sleep(CFG.ACTION_WAIT);

      // Scroll ile daha fazla yorum yükle
      for (let s = 0; s < CFG.MAX_SCROLL_REVIEWS; s++) {
        await page.evaluate(() => {
          const feed = document.querySelector('[role="feed"]');
          if (feed) feed.scrollTop = feed.scrollHeight;
          else window.scrollTo(0, document.body.scrollHeight);
        });
        await sleep(CFG.SCROLL_WAIT);
      }

      const pass2 = await saveCurrentReviews();
      totalSaved += pass2.saved;
    }
  }

  return {
    detailUpdated: Object.keys(detailUpdate).length > 0,
    reviewsSaved: totalSaved,
    status: 'ok',
  };
}

// ─── ATOMİK QUEUE (SQLite WAL) ────────────────────────────────────────────────

class ReviewQueue {
  constructor() {
    this.db = new Database(QUEUE_DB);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS review_jobs (
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

  populate(businessIds) {
    const insert = this.db.prepare(`INSERT OR IGNORE INTO review_jobs (business_id) VALUES (?)`);
    this.db.transaction(ids => { for (const id of ids) insert.run(id); })(businessIds);
    return this.db.prepare(`SELECT COUNT(*) as c FROM review_jobs WHERE status='pending'`).get().c;
  }

  claimJob() {
    return this.db.transaction(() => {
      const job = this.db.prepare(
        `SELECT * FROM review_jobs WHERE status='pending' ORDER BY id ASC LIMIT 1`
      ).get();
      if (!job) return null;
      const changed = this.db.prepare(
        `UPDATE review_jobs SET status='running', started_at=? WHERE id=? AND status='pending'`
      ).run(new Date().toISOString(), job.id).changes;
      return changed ? job : null;
    })();
  }

  done(id, reviewsSaved) {
    this.db.prepare(
      `UPDATE review_jobs SET status='done', done_at=?, reviews_saved=? WHERE id=?`
    ).run(new Date().toISOString(), reviewsSaved, id);
  }

  fail(id, err) {
    this.db.prepare(
      `UPDATE review_jobs SET status='failed', error=? WHERE id=?`
    ).run(String(err).slice(0, 400), id);
  }

  counts() {
    return this.db.prepare(`SELECT status, COUNT(*) as c FROM review_jobs GROUP BY status`)
      .all().reduce((acc, r) => { acc[r.status] = r.c; return acc; }, {});
  }

  totalInitial() { return this.db.prepare(`SELECT COUNT(*) as c FROM review_jobs`).get().c; }
  pendingCount() { return this.db.prepare(`SELECT COUNT(*) as c FROM review_jobs WHERE status='pending'`).get().c; }
  reset()        { this.db.prepare(`DELETE FROM review_jobs`).run(); }
  close()        { this.db.close(); }
}

// ─── CANLI DASHBOARD ─────────────────────────────────────────────────────────

function renderDashboard(state) {
  const { il, workerCount, startTotal, processed, totalReviews, errors, start, workerStatus } = state;
  const elapsed   = (Date.now() - start) / 1000 / 60;
  const rate      = elapsed > 0.05 ? (processed / elapsed).toFixed(1) : '...';
  const remaining = startTotal - processed;
  const eta       = (rate !== '...' && parseFloat(rate) > 0) ? Math.ceil(remaining / parseFloat(rate)) : '?';
  const pct       = startTotal > 0 ? ((processed / startTotal) * 100).toFixed(1) : '0.0';
  const barLen    = 30;
  const filled    = Math.round((processed / Math.max(startTotal, 1)) * barLen);
  const bar       = '█'.repeat(filled) + '░'.repeat(Math.max(0, barLen - filled));

  process.stdout.write('\x1b[2J\x1b[H');

  const lines = [
    `╔══════════════════════════════════════════════════╗`,
    `║      🌟 TECRUBELERIM REVIEW SCRAPER DASHBOARD    ║`,
    `╠══════════════════════════════════════════════════╣`,
    `║  İl filtresi : ${(il || 'Tümü').padEnd(33)}║`,
    `║  Worker      : ${String(workerCount).padEnd(33)}║`,
    `╠══════════════════════════════════════════════════╣`,
    `║  İlerleme    : [${bar}] ${pct}%  ║`,
    `║  İşlenen     : ${String(processed).padEnd(10)} / ${String(startTotal).padEnd(20)}║`,
    `║  Yeni yorum  : ${String(totalReviews).padEnd(33)}║`,
    `║  Hata        : ${String(errors).padEnd(33)}║`,
    `╠══════════════════════════════════════════════════╣`,
    `║  Hız         : ${(rate + ' işletme/dk').padEnd(33)}║`,
    `║  Geçen süre  : ${(elapsed.toFixed(1) + ' dk').padEnd(33)}║`,
    `║  Kalan süre  : ${(eta + ' dk (~' + (eta / 60).toFixed(1) + ' saat)').padEnd(33)}║`,
    `╠══════════════════════════════════════════════════╣`,
    `║  WORKER DURUMU                                   ║`,
  ];

  for (const [wIdx, status] of Object.entries(workerStatus)) {
    const line = `  W${wIdx}: ${status}`;
    lines.push(`║  ${line.slice(0, 47).padEnd(47)} ║`);
  }

  lines.push(`╚══════════════════════════════════════════════════╝`);
  lines.push(`  Son güncelleme: ${new Date().toLocaleTimeString('tr-TR')}`);
  lines.push('');

  console.log(lines.join('\n'));
}

// ─── WORKER ──────────────────────────────────────────────────────────────────

async function workerRun(wIdx, queue, opts, state) {
  const { skipReviews = false } = opts;

  const browser = await chromium.launch({
    headless: CFG.HEADLESS,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--lang=tr-TR', '--mute-audio'],
  });

  const context = await browser.newContext({
    locale    : 'tr-TR',
    userAgent : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    viewport  : { width: 1280, height: 800 },
    permissions: [],
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();

  // Consent popup — ilk sayfada bir kez halledelim
  await page.goto('https://www.google.com/maps', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  try {
    const consent = page.locator('button:has-text("Kabul et"), button:has-text("Accept all")');
    if (await consent.first().isVisible({ timeout: 2000 })) { await consent.first().click(); await sleep(500); }
  } catch {}

  try {
    while (true) {
      const job = queue.claimJob();
      if (!job) { state.workerStatus[wIdx] = '✅ tamamlandı'; break; }

      const business = await prisma.business.findUnique({ where: { id: job.business_id } });
      if (!business) { queue.done(job.id, 0); state.processed++; continue; }

      state.workerStatus[wIdx] = `🔍 ${business.name.substring(0, 28)}`;

      try {
        const result = await scrapeBusiness(page, business, { skipReviews });
        queue.done(job.id, result.reviewsSaved);
        state.totalReviews += result.reviewsSaved;
        state.processed++;
      } catch (e) {
        queue.fail(job.id, e.message);
        state.errors++;
        state.processed++;
        try { await page.goto('about:blank', { timeout: 5000 }); } catch {}
      }

      await rndDelay();
    }
  } finally {
    await browser.close();
  }
}

// ─── ANA DÖNGÜ ────────────────────────────────────────────────────────────────

async function run(opts = {}) {
  const { workerCount = 3, il = null, skipReviews = false, reset = false } = opts;

  const where = { isActive: true, isDeleted: false };
  if (il) where.city = { contains: il, mode: 'insensitive' };

  const businesses = await prisma.business.findMany({ where, select: { id: true } });
  if (businesses.length === 0) { console.log('⚠️  İşletme bulunamadı.'); return; }

  const queue   = new ReviewQueue();
  if (reset) { queue.reset(); console.log('🔄 Queue sıfırlandı.'); }

  const pending = queue.populate(businesses.map(b => b.id));
  console.log(`📋 ${businesses.length} işletme, ${pending} pending job.`);

  if (pending === 0) {
    console.log('✅ Tüm işletmeler işlenmiş. --reset ile tekrar çalıştır.');
    queue.close(); return;
  }

  const startTotal  = queue.totalInitial();
  const alreadyDone = startTotal - pending;

  const state = {
    il, workerCount, startTotal,
    processed: alreadyDone,
    totalReviews: 0, errors: 0,
    start: Date.now(),
    workerStatus: {},
  };

  for (let i = 1; i <= workerCount; i++) state.workerStatus[i] = 'başlıyor...';

  const dashInterval = setInterval(() => renderDashboard(state), 2000);
  renderDashboard(state);

  await Promise.all(
    Array.from({ length: workerCount }, (_, i) => workerRun(i + 1, queue, { skipReviews }, state))
  );

  clearInterval(dashInterval);
  renderDashboard(state);

  const counts = queue.counts();
  console.log(`\n🎉 Tamamlandı:`);
  console.log(`   Kaydedilen   : ${counts.done   || 0}`);
  console.log(`   Başarısız    : ${counts.failed || 0}`);
  console.log(`   Toplam yorum : ${state.totalReviews}`);

  queue.close();
}

// ─── STATUS ───────────────────────────────────────────────────────────────────

async function cmdStatus() {
  const total       = await prisma.externalReview.count({ where: { source: 'GOOGLE' } });
  const businesses  = await prisma.business.count();
  const withReviews = (await prisma.externalReview.groupBy({ by: ['businessId'] })).length;
  const withPhone   = await prisma.business.count({ where: { phoneNumber: { not: null } } });
  const withWebsite = await prisma.business.count({ where: { website: { not: null } } });

  console.log('\n=== Review Scraper Durumu ===');
  console.log(`Toplam işletme         : ${businesses}`);
  console.log(`  → Telefonu olan      : ${withPhone}`);
  console.log(`  → Websitesi olan     : ${withWebsite}`);
  console.log(`Toplam Google yorumu   : ${total}`);
  console.log(`Yorumu olan işletme    : ${withReviews}`);

  try {
    const q = new ReviewQueue();
    const c = q.counts();
    console.log('\nQueue:');
    for (const [s, n] of Object.entries(c)) console.log(`  ${s.padEnd(10)}: ${n}`);
    q.close();
  } catch {}

  if (total > 0) {
    const sample = await prisma.externalReview.findMany({
      take: 3, orderBy: { scrapedAt: 'desc' },
      select: { authorName: true, rating: true, content: true },
    });
    console.log('\nSon 3 yorum:');
    sample.forEach(r =>
      console.log(`  ⭐${r.rating} ${r.authorName} — ${(r.content || '(yalnızca puan)').substring(0, 60)}`)
    );
  }
}

// ─── TEST ─────────────────────────────────────────────────────────────────────

async function cmdTest(args) {
  const idIdx = args.indexOf('--id');
  let business;
  if (idIdx !== -1) {
    business = await prisma.business.findUnique({ where: { id: args[idIdx + 1] } });
  } else {
    business = await prisma.business.findFirst({ where: { isActive: true, isDeleted: false } });
  }
  if (!business) { console.error('İşletme bulunamadı.'); return; }

  console.log(`\n🧪 Test: ${business.name} (${business.city})`);
  CFG.HEADLESS = false;

  const browser = await chromium.launch({ headless: false, args: ['--lang=tr-TR', '--no-sandbox'] });
  const context = await browser.newContext({ locale: 'tr-TR', viewport: { width: 1280, height: 800 } });
  const page    = await context.newPage();

  try {
    const result = await scrapeBusiness(page, business, { skipReviews: false });
    console.log('\n✅ Sonuç:', JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('❌ Hata:', e.message);
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
      await run({
        workerCount : parseInt(get('--workers') || '3'),
        il          : get('--il'),
        skipReviews : has('--no-reviews'),
        reset       : has('--reset'),
      });
      break;
    case 'test': await cmdTest(args.slice(1)); break;
    default:
      console.log(`
🌟 playwright-review-scraper.cjs — v2

  node scraper/playwright-review-scraper.cjs status
  node scraper/playwright-review-scraper.cjs test
  node scraper/playwright-review-scraper.cjs test --id <businessId>

  node scraper/playwright-review-scraper.cjs run --workers 5
  node scraper/playwright-review-scraper.cjs run --workers 5 --il mardin
  node scraper/playwright-review-scraper.cjs run --workers 5 --no-reviews
  node scraper/playwright-review-scraper.cjs run --workers 5 --reset

  ─── Önerilen strateji (350k işletme) ───────────────────
  1) Detay önce (hızlı — googlePlaceId de kaydedilir):
     node scraper/playwright-review-scraper.cjs run --workers 7 --no-reviews

  2) Review sonra (googlePlaceId artık var → direkt URL, çok daha hızlı):
     node scraper/playwright-review-scraper.cjs run --workers 5 --reset
`);
  }
}

main()
  .catch(e => { console.error('❌', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
