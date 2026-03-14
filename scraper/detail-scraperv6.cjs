/**
 * detail-scraper.cjs — v1
 * İşletme detaylarını çeker: adres, telefon, website, koordinat, çalışma saatleri, hakkında
 *
 * Bilgisayar 1 çalıştırır — işletme detayları
 * Bilgisayar 2 review-scraper.cjs çalıştırır — yorumlar
 *
 * Kullanım:
 *   node scraper/detail-scraper.cjs run --workers 7
 *   node scraper/detail-scraper.cjs run --workers 7 --il istanbul
 *   node scraper/detail-scraper.cjs run --workers 7 --reset
 *   node scraper/detail-scraper.cjs status
 *   node scraper/detail-scraper.cjs test --id <businessId>
 *
 * Otomatik başlatma (Task Scheduler):
 *   Program : node
 *   Argüman : scraper/detail-scraper.cjs run --workers 7
 *   Başlangıç: C:\Users\PC\Desktop\tecrubelerim
 */

'use strict';

const { chromium }     = require('playwright');
const { PrismaClient } = require('@prisma/client');
const Database         = require('better-sqlite3');
const path             = require('path');
const fs               = require('fs');

const prisma   = new PrismaClient();
const QUEUE_DB = path.join(__dirname, '..', 'memory', 'detail-queue.db');

// ─── İL / İLÇE VERİSİ ────────────────────────────────────────────────────────

const IL_ILCE_PATH    = path.join(__dirname, '..', 'memory', 'turkiye-il-ilce.json');
const MISMATCH_LOG    = path.join(__dirname, '..', 'memory', 'address-mismatch.log');
const ilIlceData      = JSON.parse(fs.readFileSync(IL_ILCE_PATH, 'utf8'));

// Her il için: il adı + tüm ilçe adları → normalize edilmiş set
// JSON formatı: [ { "il": "Adana", "ilceler": ["Aladağ", "Ceyhan", ...] }, ... ]
// veya: { "Adana": ["Aladağ", ...], ... }  — her iki format desteklenir
function buildIlKeywords(ilIlceData) {
  const map = new Map(); // il_normalized → Set<keyword_normalized>
  const normalize = s => {
    if (s == null) return '';
    return String(s)
      .replace(/İ/g, 'i').replace(/ı/g, 'i')
      .replace(/Ğ/g, 'g').replace(/ğ/g, 'g')
      .replace(/Ş/g, 's').replace(/ş/g, 's')
      .replace(/Ç/g, 'c').replace(/ç/g, 'c')
      .replace(/Ö/g, 'o').replace(/ö/g, 'o')
      .replace(/Ü/g, 'u').replace(/ü/g, 'u')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .trim();
  };

  const list = Array.isArray(ilIlceData)
    ? ilIlceData
    : (ilIlceData.turkiye || ilIlceData.iller || Object.values(ilIlceData)[0]);
  const entries = list.map(e => [e.il || e.name || e.sehir, e.ilceler || e.districts || []]);

  for (const [il, ilceler] of entries) {
    const ilNorm = normalize(il);
    const keywords = new Set();
    keywords.add(ilNorm);
    keywords.add(normalize(il)); // orijinal haliyle de
    for (const ilce of (ilceler || [])) {
      keywords.add(normalize(ilce));
    }
    map.set(ilNorm, keywords);
  }
  return { map, normalize };
}

const { map: IL_KEYWORDS, normalize: normTR } = buildIlKeywords(ilIlceData);

/**
 * Verilen adresin, işletmenin il/ilçesiyle uyuşup uyuşmadığını kontrol eder.
 * @returns {{ match: boolean, matchedKeyword: string|null }}
 */
function checkAddressMatch(address, city, district) {
  if (!address) return { match: false, matchedKeyword: null };

  const addrNorm = normTR(address);
  const cityNorm = normTR(city);

  // İl için keyword setini al
  const keywords = IL_KEYWORDS.get(cityNorm);

  // Önce şehir adını direkt ara
  if (cityNorm && addrNorm.includes(cityNorm)) {
    return { match: true, matchedKeyword: cityNorm };
  }

  // İlçe adını ara
  if (district) {
    const distNorm = normTR(district);
    if (addrNorm.includes(distNorm)) {
      return { match: true, matchedKeyword: distNorm };
    }
  }

  // JSON'daki tüm ilçeleri ara
  if (keywords) {
    for (const kw of keywords) {
      if (kw.length > 2 && addrNorm.includes(kw)) {
        return { match: true, matchedKeyword: kw };
      }
    }
  }

  return { match: false, matchedKeyword: null };
}

/**
 * Adres uyuşmazlığını log dosyasına yazar (JSONL formatı)
 */
function logAddressMismatch(business, scrapedAddress) {
  const entry = {
    ts          : new Date().toISOString(),
    id          : business.id,
    name        : business.name,
    city        : business.city,
    district    : business.district,
    dbAddress   : business.address || null,
    newAddress  : scrapedAddress,
  };
  try {
    fs.appendFileSync(MISMATCH_LOG, JSON.stringify(entry) + '\n', 'utf8');
  } catch (e) {
    console.error('⚠️  Mismatch log yazılamadı:', e.message);
  }
}

// ─── KONFİGÜRASYON ───────────────────────────────────────────────────────────

const CFG = {
  NAVIGATE_WAIT : 800,
  ACTION_WAIT   : 700,
  MIN_DELAY     : 300,
  MAX_DELAY     : 600,
  HEADLESS      : true,
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

// ─── QUEUE ────────────────────────────────────────────────────────────────────

class Queue {
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id TEXT UNIQUE NOT NULL,
        status      TEXT DEFAULT 'pending',
        started_at  TEXT,
        done_at     TEXT,
        error       TEXT
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
      const job = this.db.prepare(
        `SELECT * FROM jobs WHERE status='pending' ORDER BY id ASC LIMIT 1`
      ).get();
      if (!job) return null;
      const ok = this.db.prepare(
        `UPDATE jobs SET status='running', started_at=? WHERE id=? AND status='pending'`
      ).run(new Date().toISOString(), job.id).changes;
      return ok ? job : null;
    })();
  }

  done(id)      { this.db.prepare(`UPDATE jobs SET status='done', done_at=? WHERE id=?`).run(new Date().toISOString(), id); }
  fail(id, err) { this.db.prepare(`UPDATE jobs SET status='failed', error=? WHERE id=?`).run(String(err).slice(0, 400), id); }
  reset()       { this.db.prepare(`DELETE FROM jobs`).run(); }
  close()       { this.db.close(); }

  pendingCount() { return this.db.prepare(`SELECT COUNT(*) as c FROM jobs WHERE status='pending'`).get().c; }
  totalCount()   { return this.db.prepare(`SELECT COUNT(*) as c FROM jobs`).get().c; }
  counts()       {
    return this.db.prepare(`SELECT status, COUNT(*) as c FROM jobs GROUP BY status`)
      .all().reduce((a, r) => { a[r.status] = r.c; return a; }, {});
  }
}

// ─── GOOGLE MAPS URL ──────────────────────────────────────────────────────────

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
  const urlNow = await page.evaluate(() => window.location.href);
  console.log('  📍 isList:', isList, '| url:', urlNow.substring(0, 80));

  if (!isList) {
    // URL'ye güvenme — DOM'a bak. Place sayfasında adres butonu veya tab olur
    const isPlaceByUrl = urlNow.includes('/maps/place/') || urlNow.includes('place_id') || urlNow.includes('@');
    const isPlaceByDom = await page.locator('[data-item-id="address"], button.hh2c6, [data-item-id^="phone"]').first().isVisible({ timeout: 1500 }).catch(() => false);
    const isPlace = isPlaceByUrl || isPlaceByDom;
    console.log('  📍 isPlace (url/dom):', isPlaceByUrl, '/', isPlaceByDom);

    if (isPlace) {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
      await sleep(CFG.NAVIGATE_WAIT);
      await page.waitForSelector('button.hh2c6, [role="tab"]', { timeout: 6000 }).catch(() => {});
      await sleep(400);
      return true;
    }
    return false;
  }

  const bizName  = business.name.toLowerCase().normalize('NFC');
  const bizWords = bizName.split(/\s+/).filter(w => w.length > 2);

  // Arama listesindeki tüm kartları al
  const results = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.Nv2PK, [role="article"]')).map(card => {
      const nameEl = card.querySelector('.qBF1Pd, .fontHeadlineSmall, [class*="fontHeadline"]');
      const link   = card.querySelector('a[href*="/maps/place/"]');
      // Koordinat URL'den çek
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
  let matchMethod = '';

  // Öncelik 1: Koordinat eşleşmesi (~500m tolerans)
  if (business.latitude && business.longitude) {
    for (const r of results) {
      if (!r.lat || !r.lng) continue;
      const dist = haversineKm(business.latitude, business.longitude, r.lat, r.lng);
      if (dist <= 0.5) { targetHref = r.href; matchMethod = `koordinat (${dist.toFixed(2)}km)`; break; }
    }
  }

  // Öncelik 2: İsim eşleşmesi
  if (!targetHref) {
    const byName = results.find(r =>
      bizWords.every(w => r.name.includes(w)) || bizWords.some(w => r.name.includes(w))
    );
    if (byName) { targetHref = byName.href; matchMethod = 'isim'; }
  }

  // Öncelik 3: İlk sonuç (son çare)
  if (!targetHref) { targetHref = results[0].href; matchMethod = 'ilk sonuç'; }

  if (process.env.DEBUG) console.log(`  🎯 Eşleşme: ${matchMethod} — ${results.length} sonuçtan`);

  // page.goto ile git — Playwright'ın kendi navigation'ı
  await page.goto(targetHref, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await sleep(CFG.NAVIGATE_WAIT);

  // Google Maps SPA: F5 gibi reload — sekmeler tam yüklenir
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
  await sleep(CFG.NAVIGATE_WAIT);
  await page.waitForSelector('button.hh2c6, [role="tab"]', { timeout: 6000 }).catch(() => {});
  await sleep(400);

  const finalUrl = await page.evaluate(() => window.location.href);
  return finalUrl.includes('/maps/place/') || finalUrl.includes('place_id');
}

// ─── DETAY PARSE ─────────────────────────────────────────────────────────────

async function parseDetail(page) {
  return await page.evaluate(() => {
    const d = {};

    // Telefon
    const tel = document.querySelector('a[href^="tel:"]');
    if (tel) d.phoneNumber = tel.getAttribute('href').replace('tel:', '').replace(/\s+/g, '');

    // Website
    for (const a of document.querySelectorAll('a[href]')) {
      const h = a.getAttribute('href') || '';
      if (h.startsWith('http') && !/(google|goo\.gl|wa\.me|maps|accounts|support)/.test(h) && h.length > 10) {
        d.website = h; break;
      }
    }

    // Adres — birden fazla yöntem
    // Yöntem 1: data-item-id="address" butonu
    const addrBtn = document.querySelector(
      'button[data-item-id="address"], [data-item-id="address"]'
    );
    if (addrBtn) {
      // aria-label: "Adres: Atatürk Cad. No:5" veya sadece adres metni
      const label = addrBtn.getAttribute('aria-label') || '';
      const colonIdx = label.indexOf(':');
      if (colonIdx !== -1) {
        d.address = label.slice(colonIdx + 1).trim();
      } else {
        // aria-label yoksa içindeki metin
        const inner = addrBtn.querySelector('.Io6YTe, .rogA2c, [class*="Io6YTe"]');
        d.address = inner?.textContent?.trim() || addrBtn.textContent?.trim();
      }
    }

    // Yöntem 2: .Io6YTe class (Google Maps adres text class'ı)
    if (!d.address || d.address.length < 5) {
      // Adres içeren div'i bul — genellikle pin ikonuyla birlikte
      const allIo = document.querySelectorAll('.Io6YTe');
      for (const el of allIo) {
        const txt = el.textContent?.trim();
        // İl/ilçe adından daha uzunsa gerçek adrestir
        if (txt && txt.length > 10 && /\d|Cad|Sok|Mah|No:|Cd\.|Sk\./.test(txt)) {
          d.address = txt; break;
        }
      }
    }

    // Yöntem 3: aria-label'da "Adres" geçen herhangi bir element
    if (!d.address || d.address.length < 5) {
      const el = document.querySelector('[aria-label*="Adres:"], [aria-label*="adres:"]');
      if (el) {
        const label = el.getAttribute('aria-label') || '';
        const idx = label.indexOf(':');
        if (idx !== -1) d.address = label.slice(idx + 1).trim();
      }
    }

    // Koordinat + PlaceID (URL'den)
    const url = window.location.href;
    const coord = url.match(/@([\d.]+),([\d.]+),/);
    if (coord) { d.latitude = parseFloat(coord[1]); d.longitude = parseFloat(coord[2]); }

    const chij = url.match(/!1s(ChIJ[^!&"]+)/);
    if (chij) d.googlePlaceId = decodeURIComponent(chij[1]);
    else {
      const hex = url.match(/!1s(0x[^!:]+:[^!&"]+)/);
      if (hex) d.googlePlaceId = hex[1];
    }

    // Çalışma saatleri
    const rows = document.querySelectorAll(
      'table[aria-label] tr, .y0skZc tr, [class*="y0skZc"] tr, ' +
      '[aria-label*="Çalışma saatleri"] tr, .t39EBf tr, [class*="t39EBf"] tr'
    );
    const hours = [];
    for (const row of rows) {
      const cells = row.querySelectorAll('td, th');
      if (cells.length >= 2) {
        const day = cells[0]?.textContent?.trim();
        const h   = cells[1]?.textContent?.trim();
        if (day?.length > 1 && h) {
          const p = h.split('–');
          hours.push({ day, openTime: p[0]?.trim() || h, closeTime: p[1]?.trim() || '' });
        }
      }
    }
    if (hours.length) d.openingHours = hours;

    return d;
  });
}

// ─── HAKKINDA PARSE ───────────────────────────────────────────────────────────

async function parseAbout(page) {
  // Hakkında butonunu bul — jsaction tabClick ile tetikle
  const hakkindaBtn = page.locator('button.hh2c6[aria-label*="hakkında"], button.hh2c6[aria-label*="About"]').first();
  const hakkindaVis = await hakkindaBtn.isVisible({ timeout: 2000 }).catch(() => false);

  if (!hakkindaVis) return null;

  // Playwright dispatchEvent — jsaction tabları için
  await hakkindaBtn.dispatchEvent('click');

  // Hakkında sekmesi aria-selected="true" olana kadar bekle
  await page.waitForFunction(() => {
    const btn = document.querySelector('button.hh2c6[aria-selected="true"]');
    return btn?.getAttribute('aria-label')?.toLowerCase().includes('hakkında');
  }, { timeout: 6000 }).catch(() => {});

  await sleep(800);

  // Playwright locator ile .iNvpkb elementlerini oku — evaluate yerine
  const skipWords = ['Harita', 'Navigasyon', 'Trafik', 'Bisiklet', 'Toplu taşıma',
    'Uydu', 'Yerküre', 'Etiket', 'Varsayılan', 'Street View', 'Arazi', 'Ölçüm'];

  const rows  = page.locator('.iNvpkb');
  const count = await rows.count();
  const items = [];

  for (let i = 0; i < count; i++) {
    const raw   = (await rows.nth(i).textContent() || '').trim();
    const clean = raw.replace(/^[\u2000-\u26FF\u2700-\u27BF\u{1F000}-\u{1FFFF}\s✓✗☑☐]+/u, '').trim();
    if (!clean || clean.length < 2 || clean.length > 120) continue;
    if (skipWords.some(s => clean.includes(s))) continue;
    if (!items.includes(clean)) items.push(clean);
  }

  const data = items.length ? { 'Özellikler': items } : {};

    return Object.keys(data).length ? data : null;
}

// ─── TEK İŞLETME ─────────────────────────────────────────────────────────────

async function scrapeOne(page, business) {
  await page.goto(buildUrl(business), { waitUntil: 'domcontentloaded', timeout: 25000 });
  await sleep(CFG.NAVIGATE_WAIT);

  // navigateToPlace: arama listesindeyse işletmeye geç + reload + sekme bekle
  const onPlace = await navigateToPlace(page, business);
  if (!onPlace) return { status: 'not_found' };

  // Detay
  const detail = await parseDetail(page);
  const update = {};

  if (detail.phoneNumber   && (!business.phoneNumber || business.phoneNumber === ''))   update.phoneNumber   = detail.phoneNumber;
  if (detail.website       && (!business.website     || business.website === ''))       update.website       = detail.website;
  if (detail.address && detail.address.length > (business.address?.length || 0)) {
    const { match, matchedKeyword } = checkAddressMatch(detail.address, business.city, business.district);
    if (match) {
      update.address = detail.address;
    } else {
      // Uyuşmasa bile yine kaydet — ama logla
      update.address = detail.address;
      console.warn(`⚠️  Adres il/ilçe uyuşmuyor — varsayılan adres kaydedildi | ${business.name} | city: ${business.city} | adres: ${detail.address}`);
      logAddressMismatch(business, detail.address);
    }
  }
  if (detail.latitude      && !business.latitude)                                       update.latitude      = detail.latitude;
  if (detail.longitude     && !business.longitude)                                      update.longitude     = detail.longitude;
  if (detail.googlePlaceId && !business.googlePlaceId)                                  update.googlePlaceId = detail.googlePlaceId;

  if (Object.keys(update).length) {
    await prisma.business.update({ where: { id: business.id }, data: update });
  }

  // Çalışma saatleri
  if (detail.openingHours?.length) {
    for (const h of detail.openingHours) {
      await prisma.openingHours.upsert({
        where:  { id: `${business.id}_${h.day}` },
        update: { openTime: h.openTime, closeTime: h.closeTime },
        create: { id: `${business.id}_${h.day}`, businessId: business.id, day: h.day, openTime: h.openTime, closeTime: h.closeTime },
      }).catch(() => {});
    }
  }

  // Hakkında
  const about = await parseAbout(page);
  if (about) {
    const existing = (business.attributes && typeof business.attributes === 'object') ? business.attributes : {};
    await prisma.business.update({
      where: { id: business.id },
      data:  { attributes: { ...existing, about } },
    });
  }

  // Debug — sonraki versiyonda kaldırılacak
  if (process.env.DEBUG) {
    console.log('  📍 detail.address    :', detail.address);
    console.log('  📍 business.address  :', business.address);
    console.log('  📍 detail.phoneNumber:', detail.phoneNumber);
    console.log('  📍 detail.hours      :', detail.openingHours?.length);
    console.log('  📍 about             :', about ? Object.keys(about) : null);
  }

  return {
    status   : 'ok',
    updated  : Object.keys(update),
    hasAbout : !!about,
    hasHours : !!detail.openingHours?.length,
    _debug   : { detailAddress: detail.address, dbAddress: business.address },
  };
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

  // Consent — bir kez
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
        select: { id: true, name: true, city: true, district: true, phoneNumber: true, website: true, address: true, latitude: true, longitude: true, googlePlaceId: true, attributes: true },
      });

      if (!biz) { queue.done(job.id); state.processed++; continue; }

      state.workerStatus[wIdx] = `🔍 ${biz.name.substring(0, 30)}`;

      try {
        const result = await scrapeOne(page, biz);
        if (result.status === 'not_found') {
          queue.fail(job.id, 'not_found');
        } else {
          queue.done(job.id);
          if (result.updated?.length) state.updated++;
        }
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
  const { il, workerCount, startTotal, processed, updated, errors, start, workerStatus } = state;
  const elapsed = (Date.now() - start) / 1000 / 60;
  const rate    = elapsed > 0.05 ? (processed / elapsed).toFixed(1) : '...';
  const rem     = startTotal - processed;
  const eta     = rate !== '...' && +rate > 0 ? Math.ceil(rem / +rate) : '?';
  const pct     = startTotal > 0 ? ((processed / startTotal) * 100).toFixed(1) : '0.0';
  const bar     = '█'.repeat(Math.round(processed / Math.max(startTotal, 1) * 30)) + '░'.repeat(Math.max(0, 30 - Math.round(processed / Math.max(startTotal, 1) * 30)));

  process.stdout.write('\x1b[2J\x1b[H');
  const lines = [
    `╔══════════════════════════════════════════════════╗`,
    `║       📍 TECRUBELERIM DETAIL SCRAPER             ║`,
    `╠══════════════════════════════════════════════════╣`,
    `║  İl filtresi : ${(il || 'Tümü').padEnd(33)}║`,
    `║  Worker      : ${String(workerCount).padEnd(33)}║`,
    `╠══════════════════════════════════════════════════╣`,
    `║  İlerleme    : [${bar}] ${pct}%  ║`,
    `║  İşlenen     : ${String(processed).padEnd(10)} / ${String(startTotal).padEnd(20)}║`,
    `║  Güncellenen : ${String(updated).padEnd(33)}║`,
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

  const total    = queue.totalCount();
  const done     = total - pending;
  const state    = { il, workerCount, startTotal: total, processed: done, updated: 0, errors: 0, start: Date.now(), workerStatus: {} };

  for (let i = 1; i <= workerCount; i++) state.workerStatus[i] = 'başlıyor...';

  const dash = setInterval(() => renderDashboard(state), 2000);
  renderDashboard(state);

  await Promise.all(Array.from({ length: workerCount }, (_, i) => runWorker(i + 1, queue, state)));

  clearInterval(dash);
  renderDashboard(state);

  const c = queue.counts();
  console.log(`\n🎉 Tamamlandı — done: ${c.done || 0}, failed: ${c.failed || 0}`);
  queue.close();
}

// ─── STATUS ───────────────────────────────────────────────────────────────────

async function cmdStatus() {
  const total      = await prisma.business.count();
  const withPhone  = await prisma.business.count({ where: { phoneNumber: { not: null } } });
  const withAddr   = await prisma.business.count({ where: { NOT: { address: '' } } });
  const withCoord  = await prisma.business.count({ where: { latitude: { not: null } } });
  const withPlace  = await prisma.business.count({ where: { googlePlaceId: { not: null } } });

  console.log('\n=== Detail Scraper Durumu ===');
  console.log(`Toplam işletme    : ${total}`);
  console.log(`  → Telefon dolu  : ${withPhone} (${(withPhone/total*100).toFixed(1)}%)`);
  console.log(`  → Adres dolu    : ${withAddr} (${(withAddr/total*100).toFixed(1)}%)`);
  console.log(`  → Koordinat var : ${withCoord} (${(withCoord/total*100).toFixed(1)}%)`);
  console.log(`  → PlaceID var   : ${withPlace} (${(withPlace/total*100).toFixed(1)}%)`);

  try {
    const q = new Queue(QUEUE_DB);
    const c = q.counts();
    console.log('\nQueue:');
    for (const [s, n] of Object.entries(c)) console.log(`  ${s.padEnd(10)}: ${n}`);
    q.close();
  } catch {}

  // Adres uyuşmazlık logu
  try {
    if (fs.existsSync(MISMATCH_LOG)) {
      const lines = fs.readFileSync(MISMATCH_LOG, 'utf8').trim().split('\n').filter(Boolean);
      console.log(`\nAdres Uyuşmazlık Logu (${MISMATCH_LOG}):`);
      console.log(`  Toplam uyuşmayan adres: ${lines.length}`);
      // Son 5 kaydı göster
      const last5 = lines.slice(-5).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      if (last5.length) {
        console.log('  Son 5 kayıt:');
        for (const e of last5) {
          console.log(`    [${e.ts}] ${e.name} (${e.city}) → ${e.newAddress}`);
        }
      }
    } else {
      console.log('\nAdres Uyuşmazlık Logu: henüz oluşmadı');
    }
  } catch (e) {
    console.log('  Log okunamadı:', e.message);
  }
}

// ─── TEST ─────────────────────────────────────────────────────────────────────

async function cmdTest(args) {
  const id = args[args.indexOf('--id') + 1];
  const biz = id
    ? await prisma.business.findUnique({ where: { id }, select: { id: true, name: true, city: true, district: true, phoneNumber: true, website: true, address: true, latitude: true, longitude: true, googlePlaceId: true, attributes: true } })
    : await prisma.business.findFirst({ where: { isActive: true, isDeleted: false }, select: { id: true, name: true, city: true, district: true, phoneNumber: true, website: true, address: true, latitude: true, longitude: true, googlePlaceId: true, attributes: true } });

  if (!biz) { console.error('İşletme bulunamadı.'); return; }
  console.log(`\n🧪 Test: ${biz.name} (${biz.city})`);
  CFG.HEADLESS = false;

  const browser = await chromium.launch({ headless: false, args: ['--lang=tr-TR', '--no-sandbox'] });
  const page    = await (await browser.newContext({ locale: 'tr-TR', viewport: { width: 1280, height: 800 } })).newPage();

  try {
    const result = await scrapeOne(page, biz);
    console.log('\n✅ Sonuç:', JSON.stringify(result, null, 2));

    // DB'den güncel hali göster
    const updated = await prisma.business.findUnique({
      where: { id: biz.id },
      select: { name: true, address: true, phoneNumber: true, website: true, latitude: true, longitude: true, googlePlaceId: true, attributes: true },
    });
    console.log('\n📋 DB\'deki güncel değerler:', JSON.stringify(updated, null, 2));

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
📍 detail-scraper.cjs

  node scraper/detail-scraper.cjs status
  node scraper/detail-scraper.cjs test
  node scraper/detail-scraper.cjs test --id <id>
  node scraper/detail-scraper.cjs run --workers 7
  node scraper/detail-scraper.cjs run --workers 7 --il istanbul
  node scraper/detail-scraper.cjs run --workers 7 --reset
`);
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); }).finally(() => prisma.$disconnect());
