/**
 * google-review-scraper.cjs — v2
 * İşletme detayları (phone, website, çalışma saatleri) + yorumları çeker.
 *
 * Kullanım:
 *   node scraper/google-review-scraper.cjs scrape --id <businessId>
 *   node scraper/google-review-scraper.cjs scrape --all
 *   node scraper/google-review-scraper.cjs scrape --all --no-reviews   ← sadece detay
 *   node scraper/google-review-scraper.cjs status
 */

const { spawnSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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

// ─── DETAY PARSE ─────────────────────────────────────────────────────────────

function parseBusinessDetail(snapshot) {
  const detail = {};

  // Telefon — link içinde telefon numarası
  const phonePatterns = [
    /link "\+90\s*([0-9\s]{10,})" \[ref=e\d+\]/,
    /link "(0[0-9]{3}[\s-]?[0-9]{3}[\s-]?[0-9]{2}[\s-]?[0-9]{2})" \[ref=e\d+\]/,
    /link "(0[0-9\s\-]{10,})" \[ref=e\d+\]/,
  ];
  for (const pat of phonePatterns) {
    const m = snapshot.match(pat);
    if (m) { detail.phoneNumber = m[1].replace(/\s+/g, ''); break; }
  }

  // Website
  const webM = snapshot.match(/link "(https?:\/\/(?!maps\.google|google\.com|goo\.gl)[^"]{5,})" \[ref=e\d+\]/);
  if (webM) detail.website = webM[1];

  // Adres — "Adres kopyala" butonu yakınındaki metin
  const addrPatterns = [
    /button "Adresi kopyala[^"]*"[^]*?- text: ([^\n]{10,})/,
    /- text: ([^\n]{10,}(?:Cad\.|Sk\.|Mah\.|No:|Kat\s\d|\/)[^\n]*)/,
  ];
  for (const pat of addrPatterns) {
    const m = snapshot.match(pat);
    if (m) { detail.address = m[1].trim(); break; }
  }

  // Çalışma saatleri
  const days = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
  const openingHours = [];
  for (const day of days) {
    const re = new RegExp(`- text: (${day}[^\\n]*)`, 'i');
    const m = snapshot.match(re);
    if (m) {
      const parts = m[1].trim().split(/\s+/);
      openingHours.push({
        day: parts[0],
        openTime: parts[1] || '',
        closeTime: parts[3] || parts[2] || '',
      });
    }
  }
  if (openingHours.length > 0) detail.openingHours = openingHours;

  // Koordinat (URL'den)
  const coordM = snapshot.match(/@([0-9.]+),([0-9.]+),/);
  if (coordM) {
    detail.latitude  = parseFloat(coordM[1]);
    detail.longitude = parseFloat(coordM[2]);
  }

  // Google Place ID
  const placeM = snapshot.match(/!1s(0x[^!:]+:[^!&"]+)/);
  if (placeM) detail.googlePlaceId = placeM[1];

  return detail;
}

// ─── HAKKINDA SEKMESİ PARSE ──────────────────────────────────────────────────

/**
 * "Hakkında" sekmesindeki özellik gruplarını parse eder.
 * Dönen yapı: { [grupAdı]: string[] }
 * Örn: { "Hizmet seçenekleri": ["Paket servisi", "İçeride servis"], ... }
 */
function parseAboutSection(snapshot) {
  const attributes = {};

  // Gerçek format (debug-about.txt'den doğrulandı):
  //   - heading "Öne çıkanlar" [level=2] [ref=eXXX]
  //   - listitem [ref=eXXX]:
  //     - generic [ref=eXXX]:
  //       - generic [ref=eXXX]:                              ← boş, ikon
  //       - generic "Harika kahveler sunuyor" [ref=eXXX]: Harika kahveler
  //                  ^^^ açıklama (tooltip)                  ^^^ gösterilen kısa metin
  //
  // Kısa metin (`:` sonrası) varsa onu al, yoksa tırnak içi açıklamayı al.
  // level=2 heading'ler grup başlığı, diğerleri (işletme adı vs.) atla.

  const lines = snapshot.split('\n');
  let currentGroup = null;

  // - heading "Öne çıkanlar" [level=2] [ref=eXXX]
  const headingRe = /^\s*-\s+heading\s+"([^"]+)"\s+\[level=2\]/;

  // - generic "Harika kahveler sunuyor" [ref=eXXX]: Harika kahveler
  // - generic "Gündelik" [ref=eXXX]   (kısa metin yok, tırnak içini al)
  const itemRe = /^\s*-\s+generic\s+"([^"]{2,})"\s+\[ref=e\d+\](?::\s*(.+))?$/;

  for (const line of lines) {
    const hm = line.match(headingRe);
    if (hm) {
      currentGroup = hm[1].trim();
      if (!attributes[currentGroup]) attributes[currentGroup] = [];
      continue;
    }

    if (!currentGroup) continue;

    const im = line.match(itemRe);
    if (!im) continue;

    const tooltip   = im[1].trim(); // tırnak içi ("Harika kahveler sunuyor")
    const shortText = im[2]?.trim(); // iki nokta sonrası ("Harika kahveler")

    const item = (shortText && shortText.length > 1) ? shortText : tooltip;

    if (!item || item.length < 2 || item.includes('©') || item.length > 100) continue;

    // Harita UI gürültüsünü filtrele
    const noise = ['Etkileşimli harita', 'Katmanlar', 'Street View', 'Yakınlaştır', 'Uzaklaştır'];
    if (noise.includes(item)) continue;

    if (!attributes[currentGroup].includes(item)) {
      attributes[currentGroup].push(item);
    }
  }

  // Boş grupları temizle
  for (const key of Object.keys(attributes)) {
    if (attributes[key].length === 0) delete attributes[key];
  }

  return attributes;
}

// ─── YORUM PARSE ─────────────────────────────────────────────────────────────

function parseReviews(text) {
  const reviews = [];
  const blockRegex = /^ {12}- generic "([^"]+)" \[ref=e\d+\]:/gm;
  const blockStarts = [];
  let m;

  while ((m = blockRegex.exec(text)) !== null) {
    const name = m[1].trim();
    if (
      name.length < 2 || name.includes('·') || name.match(/^\d/) ||
      ['Google Haritalar', 'Tüm yorumlar', 'Etkileşimli harita',
       'Yorumlar doğrulanmamıştır', 'Sonuçlar'].includes(name)
    ) continue;
    blockStarts.push({ name, index: m.index });
  }

  for (let b = 0; b < blockStarts.length; b++) {
    const { name: authorName, index: start } = blockStarts[b];
    const end = b + 1 < blockStarts.length ? blockStarts[b + 1].index : text.length;
    const block = text.slice(start, end);

    let authorLevel = null, authorReviewCount = null;
    const metaBtn = block.match(/button "([^"]*Yerel Rehber[^"]*)"/);
    if (metaBtn) {
      authorLevel = 'Yerel Rehber';
      const lvl = metaBtn[1].match(/Seviye\s*(\d+)/i);
      if (lvl) authorLevel = `Yerel Rehber · Seviye ${lvl[1]}`;
      const rc = metaBtn[1].match(/([\d.]+)\s*yorum/);
      if (rc) authorReviewCount = parseInt(rc[1].replace('.', ''));
    }

    const ratingMatch = block.match(/img "(\d)\s*yıldız/);
    const rating = ratingMatch ? parseInt(ratingMatch[1]) : null;

    let dateStr = null;
    const genericVals = [...block.matchAll(/generic(?:\s+\[[^\]]*\])?\s+\[ref=e\d+\]:\s*(.+)/g)]
      .map(x => x[1].trim()).filter(v => v.length > 0);
    for (const val of genericVals) {
      if (parseRelativeDate(val)) { dateStr = val; break; }
    }
    const publishedAt = parseRelativeDate(dateStr);

    let ownerReply = null;
    const ownerMatch = block.match(/İşletme sahibinin yanıtı[^\n]*\n\s*-[^\n]*:\s*([^\n]+)/);
    if (ownerMatch) ownerReply = ownerMatch[1].trim();

    let content = null;
    const textMatch = block.match(/- text: ([\s\S]+?)(?=\n\s+- (?:generic|button|img)|$)/);
    if (textMatch) {
      const cleaned = textMatch[1].split('\n').map(l => l.trim())
        .filter(l => l.length > 0 && !l.startsWith('-')).join(' ').trim();
      if (cleaned && !cleaned.includes('\u00a9') && !cleaned.includes('Görüntüler')) content = cleaned;
    }

    if (!content) {
      const ratingAnchor = ratingMatch ? block.indexOf(ratingMatch[0]) + ratingMatch[0].length : 0;
      const lines = block.slice(ratingAnchor).split('\n');
      for (let li = 0; li < lines.length; li++) {
        const lm = lines[li].match(/^(\s*)- generic(?:\s+\[active\])?\s+\[ref=e\d+\]:\s*(.{15,})$/);
        if (!lm) continue;
        const candidate = lm[2].trim();
        const nextIndent = (lines[li + 1] || '').match(/^(\s*)/)[1].length;
        if (nextIndent > lm[1].length) continue;
        if (candidate.includes('\u00a9') || candidate.startsWith('- ') ||
            candidate.includes('İşletme sahibinin') ||
            candidate.match(/^"?(?:Yiyecek|Hizmet|Atmosfer|Gürültü|Öğün|Kişi başı)/) ||
            candidate.match(/^₺/)) continue;
        content = candidate;
        break;
      }
    }

    if (!rating && !content) continue;
    reviews.push({ authorName, authorLevel, authorReviewCount, rating, content, publishedAt, ownerReply });
  }

  return reviews;
}

// ─── OPENCLAW YARDIMCILARI ────────────────────────────────────────────────────

function ocSnapshot() {
  const r = spawnSync('openclaw', ['browser', '--browser-profile', 'openclaw', 'snapshot'],
    { encoding: 'utf8', shell: true, maxBuffer: 10 * 1024 * 1024 });
  return r.stdout || '';
}

function ocClick(ref) {
  spawnSync('openclaw', ['browser', '--browser-profile', 'openclaw', 'click', ref],
    { encoding: 'utf8', shell: true });
}

function ocNavigate(url) {
  spawnSync('openclaw', ['browser', '--browser-profile', 'openclaw', 'navigate', url],
    { encoding: 'utf8', shell: true });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── ANA FONKSİYON ────────────────────────────────────────────────────────────

async function scrapeBusiness(business, opts = {}) {
  const { skipReviews = false } = opts;
  console.log(`\n📍 ${business.name} (${business.city})`);

  // Arama: isim + ilçe + şehir ile ara (place_id hex format URL'de çalışmıyor)
  // district varsa daha isabetli sonuç verir
  const searchParts = [business.name, business.district, business.city]
    .filter(Boolean)
    .join(' ')
    .normalize('NFC');
  const url = `https://www.google.com/maps/search/${encodeURIComponent(searchParts)}`;

  ocNavigate(url);
  await sleep(3000);

  let snapshot = ocSnapshot();

  // Arama listesindeyse işletme detay sayfasına tıkla
  if (snapshot.includes('için sonuçlar"')) {
    const bizName = business.name.toLowerCase().normalize('NFC');
    const snapLines = snapshot.split('\n');
    const articleMatches = [];

    for (let li = 0; li < snapLines.length; li++) {
      const articleM = snapLines[li].match(/- article "([^"]+)" \[ref=e\d+\]:/);
      if (!articleM) continue;
      const block15 = snapLines.slice(li, li + 15).join('\n');
      if (block15.includes('Sponsorlu')) continue;
      const linkRef = block15.match(/- link "[^"]*" \[ref=(e\d+)\]/)?.[1];
      if (linkRef) articleMatches.push({ title: articleM[1], linkRef });
    }

    // Eşleştirme: önce tam isim, sonra ilk kelime, son çare ilk sonuç
    const bizWords = bizName.split(/\s+/).filter(w => w.length > 2);
    const matched =
      articleMatches.find(a => a.title.toLowerCase().normalize('NFC') === bizName) ||
      articleMatches.find(a => bizWords.every(w => a.title.toLowerCase().normalize('NFC').includes(w))) ||
      articleMatches.find(a => bizWords.some(w => a.title.toLowerCase().normalize('NFC').includes(w)));

    if (!matched) {
      console.log('  ⚠️  Arama listesinde eşleşen işletme bulunamadı.');
      console.log('  Bulunanlar:', articleMatches.slice(0, 3).map(a => a.title).join(', '));
      return { detailUpdated: false, reviewsSaved: 0 };
    }

    console.log(`  🔗 "${matched.title}" seçildi...`);
    ocClick(matched.linkRef);
    await sleep(3000);
    snapshot = ocSnapshot();
  }

  // ─── DETAY ÇEK ───────────────────────────────────────────────────────────
  const detail = parseBusinessDetail(snapshot);
  const detailUpdate = {};

  if (detail.phoneNumber && !business.phoneNumber) detailUpdate.phoneNumber = detail.phoneNumber;
  if (detail.website    && !business.website)     detailUpdate.website    = detail.website;
  if (detail.latitude   && !business.latitude)    detailUpdate.latitude   = detail.latitude;
  if (detail.longitude  && !business.longitude)   detailUpdate.longitude  = detail.longitude;
  if (detail.googlePlaceId && !business.googlePlaceId) detailUpdate.googlePlaceId = detail.googlePlaceId;

  if (Object.keys(detailUpdate).length > 0) {
    await prisma.business.update({ where: { id: business.id }, data: detailUpdate });
    console.log(`  📋 Detay güncellendi: ${Object.keys(detailUpdate).join(', ')}`);
  }

  // Çalışma saatleri
  if (detail.openingHours?.length > 0) {
    for (const h of detail.openingHours) {
      await prisma.openingHours.upsert({
        where: { id: `${business.id}_${h.day}` },
        update: { openTime: h.openTime, closeTime: h.closeTime },
        create: { id: `${business.id}_${h.day}`, businessId: business.id, day: h.day, openTime: h.openTime, closeTime: h.closeTime },
      }).catch(() => {});
    }
  }

  // ─── HAKKINDA SEKMESİ ─────────────────────────────────────────────────────
  const aboutTabMatch =
    snapshot.match(/tab "Hakkında[^"]*" \[ref=(e\d+)\]/) ||
    snapshot.match(/tab "[^"]*hakkında[^"]*" \[ref=(e\d+)\]/i);

  if (aboutTabMatch) {
    console.log('  🏷️  Hakkında sekmesi açılıyor...');
    ocClick(aboutTabMatch[1]);
    await sleep(2500);
    const aboutSnapshot = ocSnapshot();
    const aboutAttributes = parseAboutSection(aboutSnapshot);

    if (Object.keys(aboutAttributes).length > 0) {
      // Mevcut attributes ile merge et
      const existing = (business.attributes && typeof business.attributes === 'object')
        ? business.attributes : {};
      const merged = { ...existing, about: aboutAttributes };

      await prisma.business.update({
        where: { id: business.id },
        data: { attributes: merged },
      });

      const totalItems = Object.values(aboutAttributes).reduce((s, arr) => s + arr.length, 0);
      console.log(`  🏷️  Hakkında: ${Object.keys(aboutAttributes).length} grup, ${totalItems} madde kaydedildi.`);
    } else {
      console.log('  ⚠️  Hakkında sekmesinde veri parse edilemedi.');
    }

    // Hakkında sekmesinden çıkıp Genel Bakış'a dön — sekme listesi hep görünür kalır
    const overviewTabMatch =
      aboutSnapshot.match(/tab "[^"]*genel bakış[^"]*" \[ref=(e\d+)\]/i) ||
      aboutSnapshot.match(/tab "Genel Bakış[^"]*" \[ref=(e\d+)\]/);
    if (overviewTabMatch) {
      ocClick(overviewTabMatch[1]);
      await sleep(2000);
    }
    const freshSnap = ocSnapshot();
    if (freshSnap.length > 500) snapshot = freshSnap;
  }

  if (skipReviews) {
    return { detailUpdated: Object.keys(detailUpdate).length > 0, reviewsSaved: 0 };
  }

  // ─── YORUMLAR ─────────────────────────────────────────────────────────────

  // Yorumları parse edip DB'ye kaydeden yardımcı (iki geçişte kullanılır)
  async function saveReviews(snap, label) {
    // "Daha fazla göster" butonlarını aç
    const moreRefs = [...snap.matchAll(/button "Daha fazla g[^"]*" \[ref=(e\d+)\]/g)];
    if (moreRefs.length > 0) {
      for (const mr of moreRefs) { ocClick(mr[1]); await sleep(300); }
      await sleep(500);
      snap = ocSnapshot();
    }

    const reviews = parseReviews(snap);
    console.log(`  📝 ${label}: ${reviews.length} yorum parse edildi.`);

    let saved = 0, skipped = 0;
    for (const r of reviews) {
      const contentKey = (r.content || '').substring(0, 80).replace(/\s+/g, ' ').trim();
      const sourceId = `${business.id}_${r.authorName}_${contentKey}`.substring(0, 190);
      try {
        await prisma.externalReview.upsert({
          where:  { source_sourceId: { source: 'GOOGLE', sourceId } },
          update: {
            rating: r.rating, content: r.content,
            authorLevel: r.authorLevel, authorReviewCount: r.authorReviewCount,
            publishedAt: r.publishedAt, ownerReply: r.ownerReply,
            updatedAt: new Date(),
          },
          create: {
            businessId: business.id, source: 'GOOGLE', sourceId, sourceUrl: url,
            authorName: r.authorName, authorLevel: r.authorLevel,
            authorReviewCount: r.authorReviewCount, rating: r.rating,
            content: r.content, publishedAt: r.publishedAt, ownerReply: r.ownerReply,
          },
        });
        saved++;
      } catch { skipped++; }
    }
    console.log(`  ✅ ${label}: ${saved} kaydedildi, ${skipped} atlandı.`);
    return saved;
  }

  const reviewTabMatch =
    snapshot.match(/tab "[^"]*ile ilgili yorumlar[^"]*" \[ref=(e\d+)\]/) ||
    snapshot.match(/tab "Yorumlar[^"]*" \[ref=(e\d+)\]/);

  if (!reviewTabMatch) {
    console.log('  ⚠️  Yorumlar sekmesi bulunamadı.');
    return { detailUpdated: Object.keys(detailUpdate).length > 0, reviewsSaved: 0 };
  }

  // ── GEÇİŞ 1: Varsayılan sıralama (En faydalı / Google seçkisi) ──────────
  ocClick(reviewTabMatch[1]);
  await sleep(2500);
  snapshot = ocSnapshot();

  let totalSaved = await saveReviews(snapshot, 'En faydalı');

  // ── GEÇİŞ 2: "En yeni" sıralaması ──────────────────────────────────────
  const sortBtnMatch =
    snapshot.match(/button "(?:En alakalı|Sıralama ölçütü|Alaka düzeyi)[^"]*" \[ref=(e\d+)\]/) ||
    snapshot.match(/button "[^"]*sırala[^"]*" \[ref=(e\d+)\]/i);

  if (sortBtnMatch) {
    ocClick(sortBtnMatch[1]);
    await sleep(1500);
    const sortMenuSnap = ocSnapshot();

    const newestMatch =
      sortMenuSnap.match(/(?:menuitem|option|button|generic) "En yeni[^"]*" \[ref=(e\d+)\]/) ||
      sortMenuSnap.match(/(?:menuitem|option|button|generic) "[^"]*yeni[^"]*" \[ref=(e\d+)\]/i);

    if (newestMatch) {
      ocClick(newestMatch[1]);
      await sleep(2500);
      snapshot = ocSnapshot();
      totalSaved += await saveReviews(snapshot, 'En yeni');
    } else {
      console.log('  ⚠️  "En yeni" seçeneği bulunamadı.');
      // Debug: hangi seçenekler var?
      const menuItems = [...sortMenuSnap.matchAll(/(?:menuitem|option|button|generic) "([^"]+)" \[ref=e\d+\]/g)];
      if (menuItems.length > 0) console.log('  Menü seçenekleri:', menuItems.slice(0, 8).map(x => x[1]).join(', '));
    }
  } else {
    console.log('  ⚠️  Sıralama butonu bulunamadı, sadece varsayılan yorumlar alındı.');
  }

  return { detailUpdated: Object.keys(detailUpdate).length > 0, reviewsSaved: totalSaved };
}

// ─── KOMUTLAR ─────────────────────────────────────────────────────────────────

async function cmdStatus() {
  const total       = await prisma.externalReview.count({ where: { source: 'GOOGLE' } });
  const businesses  = await prisma.business.count();
  const withReviews = await prisma.externalReview.groupBy({ by: ['businessId'] });
  const withPhone   = await prisma.business.count({ where: { phoneNumber: { not: null } } });
  const withWebsite = await prisma.business.count({ where: { website: { not: null } } });

  console.log('\n=== Scraper Durumu ===');
  console.log(`Toplam işletme        : ${businesses}`);
  console.log(`  → Telefonu olan     : ${withPhone}`);
  console.log(`  → Websitesi olan    : ${withWebsite}`);
  console.log(`Toplam Google yorumu  : ${total}`);
  console.log(`Yorumu olan işletme   : ${withReviews.length}`);

  if (total > 0) {
    const sample = await prisma.externalReview.findMany({
      take: 3, orderBy: { scrapedAt: 'desc' },
      select: { authorName: true, rating: true, content: true },
    });
    console.log('\nSon 3 yorum:');
    sample.forEach(r =>
      console.log(`  ⭐${r.rating} ${r.authorName} — ${(r.content || '').substring(0, 60)}...`)
    );
  }
}

async function cmdScrape(args) {
  const skipReviews = args.includes('--no-reviews');
  let businesses = [];

  if (args.includes('--all')) {
    businesses = await prisma.business.findMany({ where: { isActive: true, isDeleted: false } });
    console.log(`${businesses.length} işletme için ${skipReviews ? 'detay' : 'detay + yorum'} çekilecek.`);
  } else {
    const idIdx = args.indexOf('--id');
    if (idIdx === -1) {
      console.error('Kullanım:\n  node scraper/google-review-scraper.cjs scrape --all\n  node scraper/google-review-scraper.cjs scrape --id <id>');
      process.exit(1);
    }
    const biz = await prisma.business.findUnique({ where: { id: args[idIdx + 1] } });
    if (!biz) { console.error('İşletme bulunamadı:', args[idIdx + 1]); process.exit(1); }
    businesses = [biz];
  }

  let totalReviews = 0, totalDetails = 0;
  for (const biz of businesses) {
    const result = await scrapeBusiness(biz, { skipReviews });
    if (result.detailUpdated) totalDetails++;
    totalReviews += result.reviewsSaved;
    if (businesses.length > 1) await sleep(2500 + Math.random() * 2000);
  }

  console.log(`\n🎉 Tamamlandı:`);
  console.log(`   Detay güncellenen : ${totalDetails}`);
  console.log(`   Yorum kaydedilen  : ${totalReviews}`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  const [,, cmd, ...args] = process.argv;
  switch (cmd) {
    case 'status': await cmdStatus(); break;
    case 'scrape': await cmdScrape(args); break;
    default:
      console.log('Komutlar:');
      console.log('  node scraper/google-review-scraper.cjs status');
      console.log('  node scraper/google-review-scraper.cjs scrape --all');
      console.log('  node scraper/google-review-scraper.cjs scrape --all --no-reviews');
      console.log('  node scraper/google-review-scraper.cjs scrape --id <businessId>');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
