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

const prisma   = new PrismaClient();
const QUEUE_DB = path.join(__dirname, '..', 'memory', 'detail-queue.db');

// ─── KONFİGÜRASYON ───────────────────────────────────────────────────────────

const CFG = {
  NAVIGATE_WAIT : 1500,
  ACTION_WAIT   : 700,
  MIN_DELAY     : 300,
  MAX_DELAY     : 600,
  HEADLESS      : true,
};

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
  if (business.googlePlaceId?.startsWith('ChIJ')) {
    return `https://www.google.com/maps/place/?q=place_id:${business.googlePlaceId}`;
  }
  const q = [business.name, business.district, business.city].filter(Boolean).join(' ').normalize('NFC');
  return `https://www.google.com/maps/search/${encodeURIComponent(q)}`;
}

// ─── ARAMA LİSTESİNDEN GEÇ ───────────────────────────────────────────────────

async function navigateToPlace(page, business) {
  const isList = await page.locator('[role="feed"]').isVisible({ timeout: 800 }).catch(() => false);
  if (!isList) return true; // zaten place sayfasında

  const bizName  = business.name.toLowerCase().normalize('NFC');
  const bizWords = bizName.split(/\s+/).filter(w => w.length > 2);

  const results = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.Nv2PK, [role="article"]')).map(card => ({
      name: (card.querySelector('.qBF1Pd, .fontHeadlineSmall, [class*="fontHeadline"]')?.textContent?.trim() || card.textContent?.trim()?.substring(0, 60) || '').toLowerCase(),
      href: card.querySelector('a[href*="/maps/place/"]')?.href || '',
    }));
  });

  const match = results.find(r =>
    bizWords.every(w => r.name.includes(w)) || bizWords.some(w => r.name.includes(w))
  ) || results[0];

  if (!match?.href) return false;

  await page.goto(match.href, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForURL('**/maps/place/**', { timeout: 8000 }).catch(() => {});
  await sleep(CFG.NAVIGATE_WAIT);
  return page.url().includes('/maps/place/');
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
  // Hakkında butonunu bul ve tıkla
  // aria-label: "İşletme adı hakkında" (küçük h) veya textContent: "Hakkında" (büyük H)
  const clicked = await page.evaluate(() => {
    const all = [...document.querySelectorAll('button[role="tab"], button.hh2c6, button')];
    const tab = all.find(el => {
      const label = (el.getAttribute('aria-label') || '').toLowerCase();
      const text  = (el.textContent || '').toLowerCase();
      return label.includes('hakkında') || label.includes('about')
          || text.includes('hakkında') || text.includes('about');
    });
    if (!tab) return false;
    tab.click();
    return true;
  });

  if (!clicked) return null;
  await sleep(CFG.ACTION_WAIT + 300);

  const data = await page.evaluate(() => {
    const attrs = {};

    // Yöntem 1: heading (h2 / aria-level=2) → altındaki liste
    const headings = document.querySelectorAll('[aria-level="2"], h2, .fontTitleSmall, [class*="fontTitleSmall"]');
    for (const h of headings) {
      const group = h.textContent?.trim();
      if (!group || group.length < 2 || group.length > 60) continue;
      const container = h.closest('li, [role="listitem"]')?.nextElementSibling
        || h.parentElement?.nextElementSibling
        || h.nextElementSibling;
      if (!container) continue;
      const items = [];
      for (const el of container.querySelectorAll('li, [role="listitem"], .iNvpkb, [class*="iNvpkb"]')) {
        const t = el.textContent?.trim();
        if (t?.length >= 2 && t.length <= 100 && !t.includes('©') && !items.includes(t)) items.push(t);
      }
      if (items.length) attrs[group] = items;
    }

    // Yöntem 2: aria-checked elementleri (✓ işaretli özellikler)
    if (!Object.keys(attrs).length) {
      const checked = [];
      for (const el of document.querySelectorAll('[aria-checked], .section-attribute-line, [class*="section-attribute"]')) {
        const isChecked = el.getAttribute('aria-checked') === 'true'
          || el.querySelector('[aria-checked="true"]') !== null
          || el.querySelector('.hpV7sd') !== null; // yeşil tik class'ı
        if (!isChecked) continue;
        const t = el.getAttribute('aria-label') || el.textContent?.trim();
        if (t?.length >= 2 && t.length <= 100 && !t.includes('©')) checked.push(t);
      }
      if (checked.length) attrs['Özellikler'] = checked;
    }

    // Yöntem 3: .iNvpkb (Google Maps özellik satırları)
    if (!Object.keys(attrs).length) {
      const items = [];
      for (const el of document.querySelectorAll('.iNvpkb, [class*="iNvpkb"]')) {
        const t = el.textContent?.trim();
        if (t?.length >= 2 && t.length <= 100) items.push(t);
      }
      if (items.length) attrs['Özellikler'] = items;
    }

    return attrs;
  });

  // Genel Bakış'a dön
  await page.evaluate(() => {
    const all = [...document.querySelectorAll('button[role="tab"], button.hh2c6, button')];
    const tab = all.find(el => {
      const label = (el.getAttribute('aria-label') || '').toLowerCase();
      const text  = (el.textContent || '').toLowerCase();
      return label.includes('genel bakış') || label.includes('overview')
          || text.includes('genel bakış') || text.includes('overview');
    });
    if (tab) tab.click();
  });
  await sleep(CFG.ACTION_WAIT);

  return Object.keys(data).length ? data : null;
}

// ─── TEK İŞLETME ─────────────────────────────────────────────────────────────

async function scrapeOne(page, business) {
  await page.goto(buildUrl(business), { waitUntil: 'domcontentloaded', timeout: 25000 });
  await sleep(CFG.NAVIGATE_WAIT);

  const onPlace = await navigateToPlace(page, business);
  if (!onPlace) return { status: 'not_found' };

  // Detay
  const detail = await parseDetail(page);
  const update = {};

  if (detail.phoneNumber   && (!business.phoneNumber || business.phoneNumber === ''))   update.phoneNumber   = detail.phoneNumber;
  if (detail.website       && (!business.website     || business.website === ''))       update.website       = detail.website;
  if (detail.address && detail.address.length > (business.address?.length || 0))       update.address       = detail.address;
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
        queue.done(job.id);
        if (result.updated?.length) state.updated++;
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
