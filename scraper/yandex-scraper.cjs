/**
 * yandex-scraper.cjs
 * Yandex Maps'ten işletme listesi + yorum çeker.
 * review-scraper.cjs ile aynı mimari — Playwright + Queue + Worker
 *
 * KURULUM (bir kez):
 *   schema.prisma'da ReviewSource enum'una YANDEX ekle → npx prisma migrate dev
 *
 * Kullanım:
 *   node scraper/yandex-scraper.cjs run --workers 3
 *   node scraper/yandex-scraper.cjs run --workers 3 --il istanbul
 *   node scraper/yandex-scraper.cjs run --workers 3 --reset
 *   node scraper/yandex-scraper.cjs status
 *   node scraper/yandex-scraper.cjs test --id <businessId>
 *   node scraper/yandex-scraper.cjs discover --il ankara   ← sadece yeni işletme keşfi
 */

'use strict';

const { chromium }     = require('playwright');
const { PrismaClient } = require('@prisma/client');
const Database         = require('better-sqlite3');
const path             = require('path');

const prisma = new PrismaClient({ log: [] });
prisma.$connect();

const QUEUE_DB = path.join(__dirname, '..', 'memory', 'yandex-queue.db');

// ─── KONFİGÜRASYON ───────────────────────────────────────────────────────────

const CFG = {
  NAVIGATE_WAIT : 2000,
  ACTION_WAIT   : 1000,
  SCROLL_WAIT   : 800,
  MIN_DELAY     : 500,
  MAX_DELAY     : 1200,
  HEADLESS      : true,
  MAX_SCROLL    : 999,  // Tüm yorumlar — Yandex'te az yorum olduğu için sınır yok
  // Yandex Maps Türkiye
  BASE_URL      : 'https://yandex.com.tr/maps',
};

// ─── YARDIMCILAR ─────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function rndDelay() { return sleep(CFG.MIN_DELAY + Math.random() * (CFG.MAX_DELAY - CFG.MIN_DELAY)); }

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function normName(s) {
  return (s || '').toLowerCase()
    .replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s')
    .replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c')
    .replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim();
}

function nameScore(a, b) {
  const na = normName(a), nb = normName(b);
  if (na === nb) return 1;
  const wa = na.split(' ').filter(w => w.length > 2);
  const wb = nb.split(' ').filter(w => w.length > 2);
  const common = wa.filter(w => wb.includes(w)).length;
  return common / Math.max(wa.length, wb.length, 1);
}

// ─── TARİH PARSE ─────────────────────────────────────────────────────────────

function parseRelativeDate(str) {
  if (!str) return null;
  const now = new Date();
  const map = [
    [/(\d+)\s*(dakika|minute)/i,  n => new Date(now - n * 60000)],
    [/(\d+)\s*(saat|hour)/i,      n => new Date(now - n * 3600000)],
    [/(\d+)\s*(gün|gun|day)/i,    n => new Date(now - n * 86400000)],
    [/(\d+)\s*(hafta|week)/i,     n => new Date(now - n * 604800000)],
    [/(\d+)\s*(ay|month)/i,       n => new Date(now - n * 2592000000)],
    [/(\d+)\s*(yıl|yil|year)/i,   n => new Date(now - n * 31536000000)],
    [/bir\s*(dakika)/i,            () => new Date(now - 60000)],
    [/bir\s*(saat)/i,              () => new Date(now - 3600000)],
    [/bir\s*(gün|gun)/i,           () => new Date(now - 86400000)],
    [/bir\s*(hafta)/i,             () => new Date(now - 604800000)],
    [/bir\s*(ay)/i,                () => new Date(now - 2592000000)],
    [/bir\s*(yıl|yil)/i,          () => new Date(now - 31536000000)],
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
  reset()          { this.db.prepare(`UPDATE jobs SET status='pending', started_at=NULL, done_at=NULL, error=NULL WHERE status!='done'`).run(); }
  resetAll()       { this.db.prepare(`DELETE FROM jobs`).run(); }
  close()          { this.db.close(); }
  pendingCount()   { return this.db.prepare(`SELECT COUNT(*) as c FROM jobs WHERE status='pending'`).get().c; }
  totalCount()     { return this.db.prepare(`SELECT COUNT(*) as c FROM jobs`).get().c; }
  counts()         { return this.db.prepare(`SELECT status, COUNT(*) as c FROM jobs GROUP BY status`).all().reduce((a, r) => { a[r.status] = r.c; return a; }, {}); }
}

// ─── YANDEX ARAMA URL ────────────────────────────────────────────────────────

function buildSearchUrl(business) {
  const q = [business.name, business.district, business.city].filter(Boolean).join(', ');
  // Koordinat varsa ll parametresi ile arama daha isabetli
  if (business.latitude && business.longitude) {
    return `${CFG.BASE_URL}/?ll=${business.longitude},${business.latitude}&z=15&text=${encodeURIComponent(q)}`;
  }
  return `${CFG.BASE_URL}/?text=${encodeURIComponent(q + ' ' + (business.city || ''))}`;
}

// ─── YANDEX SAYFASINDA İŞLETMEYİ BUL ────────────────────────────────────────

async function navigateToPlace(page, business) {
  await sleep(CFG.NAVIGATE_WAIT);

  // Doğrudan tek işletme kartı açık mı?
  const singleCard = page.locator('.card-title-view__title, [class*="card-title-view__title"]').first();
  if (await singleCard.isVisible({ timeout: 3000 }).catch(() => false)) {
    const title = await singleCard.textContent().catch(() => '');
    if (nameScore(title, business.name) >= 0.5) {
      return { found: true, method: 'direct' };
    }
  }

  // Arama sonuçları listesi
  const results = await page.evaluate(() => {
    return Array.from(document.querySelectorAll(
      '.search-snippet-view, [class*="search-snippet-view"]'
    )).map((card, i) => {
      const nameEl = card.querySelector(
        '.search-snippet-view__body [class*="title"], .search-business-snippet-view__title, [class*="search-business-snippet-view__title"]'
      );
      const name = nameEl?.textContent?.trim() || '';

      // Koordinat — data-id veya data attr'dan
      const coordEl = card.querySelector('[data-coordinates]');
      let lat = null, lng = null;
      if (coordEl) {
        const coords = coordEl.getAttribute('data-coordinates')?.split(',');
        if (coords?.length === 2) { lng = parseFloat(coords[0]); lat = parseFloat(coords[1]); }
      }

      return { name, lat, lng, idx: i };
    }).filter(r => r.name.length > 1);
  });

  if (!results.length) return { found: false };

  // Eşleştir — koordinat + isim benzerliği
  let best = null, bestScore = 0;

  for (const r of results) {
    let score = nameScore(r.name, business.name);

    // Koordinat bonusu
    if (r.lat && r.lng && business.latitude && business.longitude) {
      const dist = haversineKm(business.latitude, business.longitude, r.lat, r.lng);
      if (dist <= 0.1) score += 0.5;
      else if (dist <= 0.3) score += 0.3;
      else if (dist <= 0.5) score += 0.1;
    }

    if (score > bestScore) { bestScore = score; best = r; }
  }

  if (!best || bestScore < 0.4) return { found: false };

  // O karta tıkla
  const cards = page.locator('.search-snippet-view, [class*="search-snippet-view"]');
  const card = cards.nth(best.idx);
  if (!await card.isVisible({ timeout: 2000 }).catch(() => false)) return { found: false };

  await card.click();
  await sleep(CFG.NAVIGATE_WAIT + 500);

  return { found: true, method: `score=${bestScore.toFixed(2)}` };
}

// ─── YORUM PARSE ─────────────────────────────────────────────────────────────

async function parseReviews(page) {
  return await page.evaluate(() => {
    const reviews = [];

    const cards = Array.from(document.querySelectorAll(
      '.business-review-view, [class*="business-review-view__"]'
    )).filter(el => !el.parentElement?.closest('.business-review-view'));

    for (const card of cards) {
      // Yazar adı
      const nameEl = card.querySelector(
        '.business-review-view__author-name, [class*="business-review-view__author-name"]'
      );
      const authorName = nameEl?.textContent?.trim() || null;
      if (!authorName || authorName.length < 2) continue;

      // Profil URL
      const profileLink = card.querySelector('a[href*="/maps/user/"]');
      const authorProfileUrl = profileLink?.href || null;

      // Profil fotoğrafı
      const photoImg = card.querySelector('.user-pic__image, [class*="user-pic__image"]');
      const authorPhoto = photoImg?.src || null;

      // Puan — stars data veya aria-label
      let rating = null;
      const starsEl = card.querySelector('[class*="rating__stars"], [class*="business-rating-badge"]');
      if (starsEl) {
        const ariaVal = starsEl.getAttribute('aria-label') || starsEl.getAttribute('title') || '';
        const m = ariaVal.match(/(\d+(?:[.,]\d+)?)/);
        if (m) rating = Math.round(parseFloat(m[1].replace(',', '.')));
        // data-value fallback
        if (!rating) {
          const filled = starsEl.querySelectorAll('[class*="icon_fill_full"], [class*="stars__star_full"]').length;
          if (filled > 0) rating = filled;
        }
      }
      if (!rating) continue;

      // Tarih
      const dateEl = card.querySelector(
        '.business-review-view__date, [class*="business-review-view__date"]'
      );
      const dateStr = dateEl?.textContent?.trim() || null;
      const publishedAt = dateStr ? (() => {
        const now = new Date();
        const map = [
          [/(\d+)\s*(dakika)/i,     n => new Date(now - n * 60000)],
          [/(\d+)\s*(saat)/i,       n => new Date(now - n * 3600000)],
          [/(\d+)\s*(gün|gun)/i,    n => new Date(now - n * 86400000)],
          [/(\d+)\s*(hafta)/i,      n => new Date(now - n * 604800000)],
          [/(\d+)\s*(ay)/i,         n => new Date(now - n * 2592000000)],
          [/(\d+)\s*(yıl|yil)/i,   n => new Date(now - n * 31536000000)],
        ];
        for (const [re, fn] of map) {
          const m = dateStr.match(re);
          if (m) return fn(parseInt(m[1]));
        }
        return null;
      })() : null;

      // İçerik
      const contentEl = card.querySelector(
        '.business-review-view__body-text, [class*="business-review-view__body-text"]'
      );
      const content = contentEl?.textContent?.trim() || null;

      // Yorum fotoğrafları
      const photoEls = card.querySelectorAll(
        '.business-review-view__photos img, [class*="business-review-view__photos"] img'
      );
      const photos = Array.from(photoEls)
        .map(img => img.src || img.getAttribute('data-src') || null)
        .filter(Boolean);

      // İşletme yanıtı
      const replyEl = card.querySelector(
        '.business-review-view__owner-answer, [class*="business-review-view__owner-answer"]'
      );
      const ownerReply = replyEl?.textContent?.trim() || null;

      reviews.push({
        authorName,
        authorProfileUrl,
        authorPhoto,
        authorLevel : null,   // Yandex'te Local Guide benzeri seviye yok
        authorReviewCount: null,
        rating,
        content,
        publishedAt : publishedAt?.toISOString() || null,
        photos      : photos.length ? photos : null,
        ownerReply,
        ownerReplyDate: null,
      });
    }

    return reviews;
  });
}

// ─── SCROLL ──────────────────────────────────────────────────────────────────

async function scrollReviews(page) {
  let lastCount = 0;
  let noChangeStreak = 0;

  for (let s = 0; s < CFG.MAX_SCROLL; s++) {
    // "Daha fazla yorum" butonuna bas
    const moreBtn = page.locator(
      'button[class*="show-more"], button:has-text("Daha fazla yorum"), [class*="business-reviews-panel-view__more-button"]'
    ).first();
    if (await moreBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await moreBtn.click();
      await sleep(CFG.SCROLL_WAIT);
    }

    // Feed scroll
    const result = await page.evaluate(() => {
      const feed = document.querySelector(
        '.business-reviews-panel-view__list, [class*="business-reviews-panel-view__list"]'
      );
      if (!feed) return { count: 0 };
      feed.scrollTop = feed.scrollHeight;
      return { count: feed.querySelectorAll('.business-review-view').length };
    });

    await sleep(CFG.SCROLL_WAIT);

    if (result.count === lastCount) {
      noChangeStreak++;
      if (noChangeStreak >= 3) break;  // 3 turda yeni yorum gelmediyse bitir
    } else {
      noChangeStreak = 0;
      lastCount = result.count;
    }
  }
}

// ─── YORUMLARI KAYDET ─────────────────────────────────────────────────────────

async function saveReviews(businessId, pageUrl, reviews) {
  let saved = 0;
  for (const r of reviews) {
    const contentKey = (r.content || '').substring(0, 80).replace(/\s+/g, ' ').trim();
    const sourceId   = `${businessId}_${r.authorName}_${contentKey}`.substring(0, 190);

    try {
      await prisma.externalReview.upsert({
        where:  { source_sourceId: { source: 'YANDEX', sourceId } },
        update: {
          rating           : r.rating,
          content          : r.content,
          authorPhoto      : r.authorPhoto,
          authorProfileUrl : r.authorProfileUrl,
          publishedAt      : r.publishedAt ? new Date(r.publishedAt) : null,
          photos           : r.photos || [],
          ownerReply       : r.ownerReply,
          updatedAt        : new Date(),
        },
        create: {
          businessId,
          source           : 'YANDEX',
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
          language         : 'tr',
        },
      });
      saved++;
    } catch {}
  }
  return saved;
}

// ─── TEK İŞLETME ─────────────────────────────────────────────────────────────

async function scrapeOne(page, business) {
  const searchUrl = buildSearchUrl(business);
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });

  const { found, method } = await navigateToPlace(page, business);
  if (!found) return { status: 'not_found', reviewsSaved: 0 };

  console.log(`  🎯 ${method} — ${business.name}`);

  const pageUrl = page.url();

  // İşletme puan/yorum sayısını güncelle
  const bizInfo = await page.evaluate(() => {
    const ratingEl = document.querySelector(
      '.card-rating__value, [class*="card-rating__value"], .business-rating-badge__rating'
    );
    const rating = ratingEl ? parseFloat((ratingEl.textContent || '').replace(',', '.')) : null;

    const countEl = document.querySelector(
      '.card-rating__count, [class*="card-rating__count"]'
    );
    const countMatch = (countEl?.textContent || '').match(/([\d\s]+)/);
    const reviewCount = countMatch ? parseInt(countMatch[1].replace(/\s/g, '')) : null;

    return { rating, reviewCount };
  });

  if (bizInfo.rating && !business.averageRating) {
    await prisma.business.update({
      where: { id: business.id },
      data: {
        ...(bizInfo.rating      ? { averageRating: bizInfo.rating }      : {}),
        ...(bizInfo.reviewCount ? { totalReviews : bizInfo.reviewCount } : {}),
      },
    }).catch(() => {});
  }

  // Yorumlar sekmesine geç
  // Yandex: div[role="tab"] tıklamayı intercept ediyor — dispatchEvent kullan
  const reviewsTab = page.locator(
    'div[role="tab"][aria-label*="Yorumlar"], div[class*="tabs-select-view__title"][aria-label*="Yorumlar"], div[class*="_name_reviews"]'
  ).first();

  const reviewsTabAlt = page.locator(
    'a[href*="/reviews/"]'
  ).first();

  const tabVisible = await reviewsTab.isVisible({ timeout: 3000 }).catch(() => false);
  const altVisible = await reviewsTabAlt.isVisible({ timeout: 1000 }).catch(() => false);

  if (!tabVisible && !altVisible) {
    return { status: 'no_reviews_tab', reviewsSaved: 0 };
  }

  if (tabVisible) {
    await reviewsTab.dispatchEvent('click');
  } else {
    await reviewsTabAlt.dispatchEvent('click');
  }
  await sleep(CFG.ACTION_WAIT);

  // Feed yüklenene kadar bekle
  await page.waitForSelector(
    '.business-reviews-panel-view__list, [class*="business-reviews-panel-view"]',
    { timeout: 8000 }
  ).catch(() => {});
  await sleep(500);

  // İlk görünenler
  const pass1 = await parseReviews(page);

  // Scroll — daha fazla yorum yükle
  await scrollReviews(page);
  const pass2 = await parseReviews(page);

  // Birleştir (tekrarları eleme — authorName + contentKey ile)
  const seen = new Set();
  const allReviews = [...pass1, ...pass2].filter(r => {
    const key = `${r.authorName}_${(r.content||'').substring(0,40)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const saved = await saveReviews(business.id, pageUrl, allReviews);
  return { status: 'ok', reviewsSaved: saved };
}

// ─── YENİ İŞLETME KEŞFİ ──────────────────────────────────────────────────────

async function discoverBusinesses(page, city, category = 'restoran') {
  const searchUrl = `${CFG.BASE_URL}/?text=${encodeURIComponent(category + ' ' + city)}`;
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await sleep(CFG.NAVIGATE_WAIT);

  // Kategori DB'den bul — slug eşleştirme
  const categorySlug = category.toLowerCase()
    .replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s')
    .replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c')
    .replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
  const dbCategory = await prisma.category.findFirst({
    where: { OR: [{ slug: categorySlug }, { name: { contains: category, mode: 'insensitive' } }] },
    select: { id: true, name: true },
  });

  const discovered = [];
  let savedCount = 0;
  const seenCoords = new Set(); // Bu session'da işlediğimiz koordinatlar

  for (let scroll = 0; scroll < 20; scroll++) {
    const items = await page.evaluate(() => {
      return Array.from(document.querySelectorAll(
        '.search-snippet-view, [class*="search-snippet-view"]'
      )).map(card => {
        const nameEl = card.querySelector('[class*="title"]');
        const name = nameEl?.textContent?.trim() || '';

        const addrEl = card.querySelector('[class*="subtitle"], [class*="address"]');
        const address = addrEl?.textContent?.trim() || '';

        const phoneEl = card.querySelector('[class*="phone"], [href^="tel:"]');
        const phone = phoneEl?.textContent?.trim() || phoneEl?.getAttribute('href')?.replace('tel:','') || null;

        const ratingEl = card.querySelector('[class*="rating__value"], [class*="business-rating-badge__rating"]');
        const ratingMatch = (ratingEl?.textContent || '').match(/(\d+[.,]\d+)/);
        const rating = ratingMatch ? parseFloat(ratingMatch[1].replace(',', '.')) : null;

        const reviewEl = card.querySelector('[class*="rating__count"]');
        const reviewMatch = (reviewEl?.textContent || '').match(/(\d+)/);
        const reviewCount = reviewMatch ? parseInt(reviewMatch[1]) : 0;

        const coordEl = card.querySelector('[data-coordinates]');
        let lat = null, lng = null;
        if (coordEl) {
          const c = coordEl.getAttribute('data-coordinates')?.split(',');
          if (c?.length === 2) { lng = parseFloat(c[0]); lat = parseFloat(c[1]); }
        }

        return { name, address, phone, rating, reviewCount, lat, lng };
      }).filter(r => r.name.length > 1);
    });

    for (const item of items) {
      if (!item.name || !item.lat || !item.lng) continue;

      const coordKey = `${item.lat.toFixed(4)},${item.lng.toFixed(4)}`;
      if (seenCoords.has(coordKey)) continue;
      seenCoords.add(coordKey);

      // ── KOORDİNAT KONTROLÜ — 500m içinde işletme var mı? ────────────────
      const nearby = await prisma.$queryRawUnsafe(`
        SELECT id, name FROM "Business"
        WHERE latitude IS NOT NULL
          AND (
            6371 * 2 * ASIN(SQRT(
              POWER(SIN((RADIANS($1) - RADIANS(latitude)) / 2), 2) +
              COS(RADIANS($1)) * COS(RADIANS(latitude)) *
              POWER(SIN((RADIANS($2) - RADIANS(longitude)) / 2), 2)
            ))
          ) <= 0.5
        LIMIT 1
      `, item.lat, item.lng);

      if (nearby.length > 0) continue; // Zaten var

      // ── YENİ İŞLETME — DB'ye kaydet ──────────────────────────────────────
      const slug = item.name.toLowerCase()
        .replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s')
        .replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c')
        .replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-')
        + '-' + Math.random().toString(36).substring(2, 7);

      try {
        const newBiz = await prisma.business.create({
          data: {
            name         : item.name,
            slug,
            address      : item.address || '',
            city,
            latitude     : item.lat,
            longitude    : item.lng,
            phoneNumber  : item.phone || null,
            averageRating: item.rating || 0,
            totalReviews : item.reviewCount || 0,
            categoryId   : dbCategory?.id || (await prisma.category.findFirst({ select: { id: true } })).id,
            attributes   : { source: 'yandex_discover', searchTerm: category },
            isActive     : true,
            isDeleted    : false,
          },
        });

        savedCount++;
        discovered.push({ ...item, dbId: newBiz.id });
        console.log(`  🆕 Kaydedildi: ${item.name} (${item.address || city}) [${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}]`);
      } catch (e) {
        // slug çakışması olabilir — atla
        if (!e.message.includes('Unique')) console.warn(`  ⚠️  Kayıt hatası: ${item.name} — ${e.message.substring(0, 60)}`);
      }
    }

    // Scroll / daha fazla
    const more = page.locator('[class*="show-more"], button:has-text("Daha fazla")').first();
    if (await more.isVisible({ timeout: 1000 }).catch(() => false)) {
      await more.click();
      await sleep(CFG.SCROLL_WAIT);
    } else {
      const prevCount = seenCoords.size;
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(CFG.SCROLL_WAIT + 500);
      // Sayfa büyümüyorsa dur
      if (seenCoords.size === prevCount) break;
    }
  }

  console.log(`\n✅ Keşif tamamlandı — ${savedCount} yeni işletme kaydedildi.`);
  return discovered;
}

// ─── WORKER ──────────────────────────────────────────────────────────────────

async function runWorker(wIdx, queue, state) {
  const browser = await chromium.launch({
    headless: CFG.HEADLESS,
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--lang=tr-TR',
      '--mute-audio',
    ],
  });
  const ctx = await browser.newContext({
    locale      : 'tr-TR',
    userAgent   : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    viewport    : { width: 1280, height: 900 },
    geolocation : { latitude: 39.9334, longitude: 32.8597 }, // Ankara
    permissions : ['geolocation'],
  });
  await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => undefined }));
  const page = await ctx.newPage();

  // Yandex cookie banner'ı kapat
  await page.goto(CFG.BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  await sleep(1000);
  try {
    const cookieBtn = page.locator('button:has-text("Kabul et"), button:has-text("Accept"), [class*="cookie"] button').first();
    if (await cookieBtn.isVisible({ timeout: 2000 })) { await cookieBtn.click(); await sleep(500); }
  } catch {}

  try {
    while (true) {
      const job = queue.claimJob();
      if (!job) { state.workerStatus[wIdx] = '✅ tamamlandı'; break; }

      const biz = await prisma.business.findUnique({
        where  : { id: job.business_id },
        select : { id: true, name: true, city: true, district: true, latitude: true, longitude: true, averageRating: true, totalReviews: true },
      });

      if (!biz) { queue.done(job.id, 0); state.processed++; continue; }

      state.workerStatus[wIdx] = `🗺️ ${biz.name.substring(0, 28)}`;

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

      if (state.processed % 20 === 0) {
        await page.goto('about:blank', { timeout: 5000 }).catch(() => {});
        await sleep(500);
        if (global.gc) global.gc();
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
    `║       🗺️  TECRUBELERIM YANDEX SCRAPER            ║`,
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
    `║  Kalan süre  : ${(eta + ' dk (~' + (eta/60).toFixed(1) + ' saat)').padEnd(33)}║`,
    `╠══════════════════════════════════════════════════╣`,
    `║  WORKER DURUMU                                   ║`,
  ];
  for (const [i, s] of Object.entries(workerStatus))
    lines.push(`║  ${(`  W${i}: ${s}`).slice(0, 47).padEnd(47)} ║`);
  lines.push(`╚══════════════════════════════════════════════════╝`);
  lines.push(`  Son güncelleme: ${new Date().toLocaleTimeString('tr-TR')}`);
  console.log(lines.join('\n'));
}

// ─── RUN ─────────────────────────────────────────────────────────────────────

async function run(opts = {}) {
  const { workerCount = 3, il = null, reset = false } = opts;

  const where = { isActive: true, isDeleted: false };
  if (il) where.city = { contains: il, mode: 'insensitive' };

  const businesses = await prisma.business.findMany({
    where,
    select  : { id: true },
    orderBy : { id: 'asc' },
  });

  if (!businesses.length) { console.log('⚠️  İşletme bulunamadı.'); return; }

  const queue = new Queue(QUEUE_DB);
  if (reset) { queue.resetAll(); console.log('🔄 Queue sıfırlandı.'); }

  const pending = queue.populate(businesses.map(b => b.id));
  if (!pending) { console.log('✅ Tüm işletmeler işlenmiş. --reset ile tekrar.'); queue.close(); return; }

  const total = queue.totalCount();
  const done  = total - pending;
  const state = { il, workerCount, startTotal: total, processed: done, totalReviews: 0, errors: 0, start: Date.now(), workerStatus: {} };

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
  const total       = await prisma.externalReview.count({ where: { source: 'YANDEX' } });
  const businesses  = await prisma.business.count();
  const withReviews = (await prisma.externalReview.groupBy({ by: ['businessId'], where: { source: 'YANDEX' } })).length;

  console.log('\n=== Yandex Scraper Durumu ===');
  console.log(`Toplam işletme         : ${businesses}`);
  console.log(`Toplam Yandex yorumu   : ${total}`);
  console.log(`Yorumu olan işletme    : ${withReviews}`);

  try {
    const q = new Queue(QUEUE_DB);
    const c = q.counts();
    console.log('\nQueue:');
    for (const [s, n] of Object.entries(c)) console.log(`  ${s.padEnd(10)}: ${n}`);
    q.close();
  } catch {}

  if (total > 0) {
    const sample = await prisma.externalReview.findMany({
      where: { source: 'YANDEX' },
      take: 3, orderBy: { scrapedAt: 'desc' },
      select: { authorName: true, rating: true, content: true },
    });
    console.log('\nSon 3 Yandex yorumu:');
    sample.forEach(r => console.log(`  ⭐${r.rating} ${r.authorName} — ${(r.content || '(yalnızca puan)').substring(0, 60)}`));
  }
}

// ─── TEST ─────────────────────────────────────────────────────────────────────

async function cmdTest(args) {
  const id  = args[args.indexOf('--id') + 1];
  const biz = id
    ? await prisma.business.findUnique({ where: { id }, select: { id: true, name: true, city: true, district: true, latitude: true, longitude: true, averageRating: true, totalReviews: true } })
    : await prisma.business.findFirst({ where: { isActive: true, isDeleted: false }, select: { id: true, name: true, city: true, district: true, latitude: true, longitude: true, averageRating: true, totalReviews: true } });

  if (!biz) { console.error('İşletme bulunamadı.'); return; }
  console.log(`\n🧪 Test: ${biz.name} (${biz.city})`);
  CFG.HEADLESS = false;

  const browser = await chromium.launch({ headless: false, args: ['--lang=tr-TR', '--no-sandbox'] });
  const page    = await (await browser.newContext({ locale: 'tr-TR', viewport: { width: 1280, height: 900 } })).newPage();

  try {
    const result = await scrapeOne(page, biz);
    console.log('\n✅ Sonuç:', JSON.stringify(result, null, 2));

    if (result.reviewsSaved > 0) {
      const reviews = await prisma.externalReview.findMany({
        where: { businessId: biz.id, source: 'YANDEX' },
        take: 3, orderBy: { scrapedAt: 'desc' },
        select: { authorName: true, rating: true, content: true, photos: true },
      });
      console.log('\n📋 Kaydedilen son yorumlar:');
      reviews.forEach((r, i) => console.log(
        `  ${i+1}. ⭐${r.rating} — ${r.authorName}${r.content ? '\n     💬 '+r.content.substring(0,80) : ''}${r.photos?.length ? '\n     🖼️  '+r.photos.length+' fotoğraf' : ''}`
      ));
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
      await run({
        workerCount : parseInt(get('--workers') || '3'),
        il          : get('--il'),
        reset       : has('--reset'),
      });
      break;
    case 'test': await cmdTest(args.slice(1)); break;
    case 'discover': {
      const il  = get('--il') || 'ankara';
      const cat = get('--category') || 'restoran';
      const browser = await chromium.launch({ headless: CFG.HEADLESS, args: ['--no-sandbox', '--lang=tr-TR'] });
      const page    = await (await browser.newContext({ locale: 'tr-TR', viewport: { width: 1280, height: 900 } })).newPage();
      console.log(`\n🔍 Keşif: ${cat} — ${il}`);
      const found = await discoverBusinesses(page, il, cat);
      console.log(`\n✅ ${found.length} yeni işletme bulundu.`);
      await browser.close();
      break;
    }
    default:
      console.log(`
🗺️  yandex-scraper.cjs

  ÖNCELİKLE: schema.prisma'ya YANDEX ekle
    enum ReviewSource { GOOGLE YANDEX ... }
    npx prisma migrate dev --name add-yandex-source

  node scraper/yandex-scraper.cjs status
  node scraper/yandex-scraper.cjs test
  node scraper/yandex-scraper.cjs test --id <id>
  node scraper/yandex-scraper.cjs run --workers 3
  node scraper/yandex-scraper.cjs run --workers 3 --il istanbul
  node scraper/yandex-scraper.cjs run --workers 3 --reset
  node scraper/yandex-scraper.cjs discover --il ankara --category restoran
`);
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); }).finally(() => prisma.$disconnect());
