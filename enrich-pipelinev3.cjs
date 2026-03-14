// enrich-pipeline.cjs
// tecrubelerim.com — AI Zenginleştirme Pipeline
//
// Kullanım:
//   node enrich-pipeline.cjs
//   node enrich-pipeline.cjs --limit 100
//   node enrich-pipeline.cjs --category yeme-icme
//   node enrich-pipeline.cjs --resume

const { PrismaClient } = require('@prisma/client')
const http = require('http')

const prisma = new PrismaClient()

const CONFIG = {
  model: 'llama3.1:8b',
  batchSize: 1,
  maxReviewsPerBiz: 10,
  qaCount: 5,
  timeoutMs: 60000,
  delayBetweenBatches: 0,
}

const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  gray:   '\x1b[90m',
  white:  '\x1b[37m',
}

function bar(filled, total, width = 30) {
  const pct = Math.round((filled / total) * width)
  return C.green + '█'.repeat(pct) + C.gray + '░'.repeat(width - pct) + C.reset
}

const CATEGORY_HINTS = {
  'yeme-icme':      'rezervasyon, vejetaryen/vegan seçenek, çocuk menüsü, paket servis, alkol servisi, açık alan oturma, fiyat aralığı, özel gün organizasyonu',
  'guzellik-bakim': 'randevu zorunluluğu, erkek/kadın/karma kabul, hizmet süresi, kullanılan ürün markaları, fiyat aralığı, otopark, hijyen standartları',
  'saglik-medikal': 'SGK/sigorta kabul, randevu sistemi, bekleme süresi, uzman doktor kadrosu, acil kabul, muayene ücreti, online konsültasyon',
  'konaklama':      'check-in/check-out saati, kahvaltı dahil mi, evcil hayvan kabul, otopark, wifi kalitesi, havuz/spa, iptal politikası',
  'egitim':         'yaş ve seviye grupları, deneme dersi imkanı, grup veya bireysel ders, online seçenek, sertifika, ücret ve taksit',
  'hizmetler':      'evde/yerinde hizmet, fiyat teklifi, garanti süresi, çalışma saatleri, acil servis, ödeme yöntemleri',
  'alisveris':      'çalışma saatleri, ücretsiz kargo/iade politikası, taksit imkanı, indirim kartı, otopark, online sipariş',
  'eglence-kultur': 'bilet fiyatı, yaş kısıtlaması, çocuk indirimi, önceden rezervasyon, ulaşım, özel etkinlikler',
  'evcil-hayvan':   'hangi hayvan türleri kabul edilir, acil hizmet, konaklama/otelcilik, randevu sistemi, aşı ve bakım paketleri',
  'ulasim':         '7/24 hizmet, online rezervasyon, ehliyet/belge gereksinimleri, sigorta dahil mi, teslimat ve teslim alma noktaları',
}

// Her kategori için ZORUNLU ilk sorular — model bunları mutlaka üretmeli
const CATEGORY_REQUIRED_QA = {
  'yeme-icme':      ['Rezervasyon gerekli mi?', 'Vejetaryen veya vegan seçenek var mı?', 'Fiyat aralığı nedir?'],
  'guzellik-bakim': ['Randevu zorunlu mu?', 'Erkek müşteri kabul ediliyor mu?', 'Fiyat aralığı nedir?'],
  'saglik-medikal': ['SGK veya özel sigorta kabul ediliyor mu?', 'Randevu nasıl alınır?', 'Bekleme süresi ne kadar?'],
  'konaklama':      ['Kahvaltı fiyata dahil mi?', 'Evcil hayvan kabul ediliyor mu?', 'Check-in/check-out saatleri nedir?'],
  'egitim':         ['Deneme dersi imkanı var mı?', 'Grup mu bireysel mi ders veriliyor?', 'Ücretler ve taksit seçenekleri nedir?'],
  'hizmetler':      ['Evde hizmet veriliyor mu?', 'Garanti süresi var mı?', 'Acil servis mevcut mu?'],
  'alisveris':      ['Otopark ücretsiz mi?', 'İade politikası nasıl?', 'Taksit imkanı var mı?'],
  'eglence-kultur': ['Bilet fiyatı ne kadar?', 'Çocuklar için indirim var mı?', 'Önceden rezervasyon gerekli mi?'],
  'evcil-hayvan':   ['Hangi hayvan türlerine hizmet veriliyor?', 'Acil hizmet mevcut mu?', 'Randevu zorunlu mu?'],
  'ulasim':         ['7/24 hizmet veriliyor mu?', 'Online rezervasyon yapılabiliyor mu?', 'Sigorta dahil mi?'],
}

const PRICE_LABELS = { '$': 'Uygun fiyatlı', '$$': 'Orta fiyatlı', '$$$': 'Pahalı', '$$$$': 'Çok pahalı' }

// ============================================================
// PROMPT — tüm 5 veri kaynağını kullanır
// ============================================================
// Yorumları tara — hangi konular geçiyor?
function detectTopics(reviewText, hoursText, priceRange, tumOzellikler, categorySlug) {
  const t = reviewText.toLowerCase()
  const sorular = []

  // DB'den gelen kesin bilgiler — her zaman ekle
  if (hoursText) {
    sorular.push({ soru: 'Çalışma saatleri nedir?', cevap_hint: `DB: ${hoursText}`, kategori: 'çalışma saatleri' })
  }
  if (priceRange) {
    sorular.push({ soru: 'Fiyat aralığı nasıl?', cevap_hint: `DB: ${PRICE_LABELS[priceRange] || priceRange}`, kategori: 'fiyat' })
  }

  // Yorumlarda geçen konular
  if (t.includes('otopark') || t.includes('park yeri') || t.includes('araç park'))
    sorular.push({ soru: 'Otopark imkanı var mı?', cevap_hint: 'yorumlardan', kategori: 'otopark' })

  if (t.includes('rezervasyon') || t.includes('randevu') || t.includes('yer ayırt'))
    sorular.push({ soru: 'Rezervasyon gerekli mi?', cevap_hint: 'yorumlardan', kategori: 'rezervasyon' })

  if (t.includes('çocuk') || t.includes('aile') || t.includes('bebek'))
    sorular.push({ soru: 'Çocuklar ve aileler için uygun mu?', cevap_hint: 'yorumlardan', kategori: 'aile' })

  if (t.includes('engel') || t.includes('tekerlekli') || t.includes('erişim'))
    sorular.push({ soru: 'Engelli erişimi mevcut mu?', cevap_hint: 'yorumlardan', kategori: 'erişim' })

  if (t.includes('wifi') || t.includes('internet') || t.includes('bağlantı'))
    sorular.push({ soru: 'Ücretsiz WiFi var mı?', cevap_hint: 'yorumlardan', kategori: 'wifi' })

  if (t.includes('paket') || t.includes('gel al') || t.includes('sipariş') || t.includes('delivery'))
    sorular.push({ soru: 'Paket servis veya gel-al seçeneği var mı?', cevap_hint: 'yorumlardan', kategori: 'paket servis' })

  if (t.includes('vejetaryen') || t.includes('vegan') || t.includes('glutensiz'))
    sorular.push({ soru: 'Vejetaryen veya vegan seçenek var mı?', cevap_hint: 'yorumlardan', kategori: 'diyet' })

  if (t.includes('alkol') || t.includes('bira') || t.includes('şarap') || t.includes('içki'))
    sorular.push({ soru: 'Alkollü içecek servisi yapılıyor mu?', cevap_hint: 'yorumlardan', kategori: 'alkol' })

  if (t.includes('kart') || t.includes('nakit') || t.includes('ödeme'))
    sorular.push({ soru: 'Kredi kartı ile ödeme yapılabiliyor mu?', cevap_hint: 'yorumlardan', kategori: 'ödeme' })

  if (t.includes('kuyruk') || t.includes('bekleme') || t.includes('kalabalık') || t.includes('sıra'))
    sorular.push({ soru: 'Yoğun saatlerde bekleme süresi ne kadar?', cevap_hint: 'yorumlardan', kategori: 'bekleme' })

  if (t.includes('köpek') || t.includes('kedi') || t.includes('evcil hayvan') || t.includes('pet'))
    sorular.push({ soru: 'Evcil hayvanlar kabul ediliyor mu?', cevap_hint: 'yorumlardan', kategori: 'evcil hayvan' })

  // Kategori bazlı ek sorular
  const catExtras = {
    'konaklama':      [
      { soru: 'Kahvaltı fiyata dahil mi?', kategori: 'kahvaltı' },
      { soru: 'Check-in/check-out saatleri nedir?', kategori: 'check-in' },
    ],
    'saglik-medikal': [
      { soru: 'SGK veya özel sigorta kabul ediliyor mu?', kategori: 'sigorta' },
      { soru: 'Randevu nasıl alınır?', kategori: 'randevu' },
    ],
    'egitim':         [
      { soru: 'Deneme dersi imkanı var mı?', kategori: 'deneme' },
      { soru: 'Bireysel mi grup dersi mi veriliyor?', kategori: 'ders tipi' },
    ],
    'eglence-kultur': [
      { soru: 'Bilet fiyatı ne kadar?', kategori: 'bilet' },
      { soru: 'Çocuklar için indirim var mı?', kategori: 'indirim' },
    ],
    'guzellik-bakim': [
      { soru: 'Erkek müşteri kabul ediliyor mu?', kategori: 'cinsiyet' },
    ],
  }

  const extras = catExtras[categorySlug] || []
  for (const e of extras) {
    if (!sorular.find(s => s.kategori === e.kategori)) {
      sorular.push({ ...e, cevap_hint: 'yorumlardan' })
    }
  }

  // Özelliklerde geçenler
  if (tumOzellikler.some(o => o.toLowerCase().includes('havuz') || o.toLowerCase().includes('spa')))
    sorular.push({ soru: 'Havuz veya spa imkanı var mı?', cevap_hint: 'ozelliklerden', kategori: 'havuz' })

  // Genel yedek sorular — yukarıdan yeterli çıkmazsa doldur
  const yedekler = [
    { soru: 'Genel temizlik ve hijyen nasıl?', kategori: 'hijyen' },
    { soru: 'Personel ilgisi ve hizmet kalitesi nasıl?', kategori: 'hizmet' },
    { soru: 'Fiyat/performans oranı nasıl?', kategori: 'fiyat_performans' },
    { soru: 'Ulaşım kolaylığı nasıl?', kategori: 'ulaşım' },
    { soru: 'Tekrar ziyaret eder misiniz?', kategori: 'tavsiye' },
  ]

  for (const y of yedekler) {
    if (sorular.length >= CONFIG.qaCount) break
    if (!sorular.find(s => s.kategori === y.kategori)) {
      sorular.push({ ...y, cevap_hint: 'yorumlardan' })
    }
  }

  return sorular.slice(0, CONFIG.qaCount)
}

function buildPrompt(business, reviews, openingHours, attributes, categorySlug) {
  // 1) YORUMLAR
  const filteredReviews = reviews.filter(r => r.content && r.content.length > 30).slice(0, CONFIG.maxReviewsPerBiz)
  const reviewText = filteredReviews.length > 0
    ? filteredReviews
        .map((r, i) => {
          const isLocal = r.authorLevel && r.authorLevel.includes('Yerel Rehber')
          const highCount = r.authorReviewCount && r.authorReviewCount > 50
          const badge = isLocal
            ? `[Yerel Rehber${highCount ? ', ' + r.authorReviewCount + ' yorum' : ''}]`
            : highCount ? `[${r.authorReviewCount} yorumlu kullanıcı]` : ''
          const reply = r.ownerReply
            ? `\n   → İşletme yanıtı: ${r.ownerReply.slice(0, 250)}`
            : ''
          return `${i + 1}. [${r.rating ? r.rating + '★' : '?'}${badge ? ' ' + badge : ''}] ${r.content.slice(0, 400)}${reply}`
        })
        .join('\n')
    : 'Yorum bulunmuyor.'

  // 2) ÇALIŞMA SAATLERİ
  const hoursText = openingHours.length > 0
    ? openingHours.map(h => `${h.day}: ${h.openTime}–${h.closeTime}`).join(', ')
    : null

  // 3) ÖZELLİKLER
  const jsonOzellikler = (() => {
    try {
      const o = business.attributes?.about?.['Özellikler']
      return Array.isArray(o) ? o : []
    } catch { return [] }
  })()
  const tableOzellikler = attributes.map(a => a.name)
  const tumOzellikler = [...new Set([...jsonOzellikler, ...tableOzellikler])].slice(0, 15)

  // 4) FİYAT ARALIĞI
  const priceRange = (() => {
    try { return business.attributes?.priceRange || null } catch { return null }
  })()

  // 5) AÇIKLAMA
  const description = business.description ? business.description.slice(0, 300) : null

  // 6) SORULARI KOD TARAFINDA SEÇ
  const secilenSorular = detectTopics(reviewText, hoursText, priceRange, tumOzellikler, categorySlug)
  const soruListesi = secilenSorular
    .map((s, i) => `${i + 1}. "${s.soru}" — kategori: ${s.kategori}`)
    .join('\n')

  return `Sen tecrubelerim.com için çalışan bir Türkçe işletme analisti asistanısın.
Sana bir işletmenin bilgilerini ve gerçek müşteri yorumlarını veriyorum.

━━━ İŞLETME BİLGİLERİ ━━━
Ad               : ${business.name}
Kategori         : ${business.categoryName || '?'}
Konum            : ${business.city}${business.district ? ' / ' + business.district : ''}
Puan             : ${business.averageRating}/5 (${business.totalReviews} yorum)${priceRange ? `\nFiyat seviyesi   : ${priceRange} — ${PRICE_LABELS[priceRange] || priceRange}` : ''}${hoursText ? `\nÇalışma saatleri : ${hoursText}` : ''}${description ? `\nAçıklama         : ${description}` : ''}${tumOzellikler.length > 0 ? `\nÖzellikler       : ${tumOzellikler.join(', ')}` : ''}

━━━ MÜŞTERİ YORUMLARI ━━━
(Not: [Yerel Rehber] ve çok yorumlu kullanıcıların görüşleri daha güvenilirdir)
${reviewText}

━━━ GÖREV ━━━
Sadece aşağıdaki JSON'u döndür, başka hiçbir şey yazma:

{
  "etiketler": {
    "atmosfer": "<yorumlara_gore_sec>",
    "hiz": "<yorumlara_gore_sec>",
    "fiyat_kalite": "<yorumlara_gore_sec>",
    "genel_deneyim": "<yorumlara_gore_sec>"
  },
  "ozellikler": ["<gercek_ozellik_1>", "<gercek_ozellik_2>"],
  "ozet": "<bu_isletmeye_ozel_2_3_cumle>",
  "qa": []
}

━━━ ZORUNLU KURALLAR ━━━
1. ETİKETLER YORUMLARA GÖRE BELİRLENMELİ:
   - atmosfer    : sakin | kalabalık | romantik | aile_dostu | gençlik | karma
   - hiz         : çok_hızlı | hızlı | normal | yavaş | çok_yavaş
   - fiyat_kalite: çok_uygun | uygun | orta | pahalı | çok_pahalı
   - genel_deneyim: mükemmel | iyi | orta | kötü | çok_kötü
   Yorumlarda "kalabalık/bekleme" → atmosfer=kalabalık, "yavaş/geç" → hiz=yavaş, "pahalı" → fiyat_kalite=pahalı

2. "qa" dizisinde SADECE aşağıdaki ${secilenSorular.length} soruyu cevapla, başka soru ekleme:
${soruListesi}

3. Her cevap:
   - Yorumlardan veya işletme bilgilerinden (saat, fiyat, özellikler) gelsin
   - En az 1 tam cümle olsun
   - FİYAT varsa sonuna ekle: "(Bu bilgi müşteri yorumlarından alınmıştır, güncel olmayabilir.)"
   - Çalışma saati sorusunda DB'deki saatleri kullan: ${hoursText || 'mevcut değil'}

4. İşletme yanıtlarında ("→ İşletme yanıtı:") spesifik bilgi varsa cevaplarda kullan.

5. Tüm metinler Türkçe. Sadece JSON döndür, markdown veya açıklama ekleme.`
}

// ============================================================
// OLLAMA API
// ============================================================
function callOllama(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: CONFIG.model,
      prompt,
      stream: false,
      options: { temperature: 0.2, top_p: 0.9, num_predict: 900, num_ctx: 2048 },
    })
    const req = http.request(
      { hostname: 'localhost', port: 11434, path: '/api/generate', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let data = ''
        res.on('data', c => data += c)
        res.on('end', () => {
          try { resolve(JSON.parse(data).response || '') }
          catch (e) { reject(new Error('Ollama parse hatası: ' + data.slice(0, 200))) }
        })
      }
    )
    req.setTimeout(CONFIG.timeoutMs, () => { req.destroy(); reject(new Error('Ollama timeout')) })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

function parseJsonResponse(raw) {
  let text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('JSON bulunamadı')
  return JSON.parse(text.slice(start, end + 1))
}

// ============================================================
// TEK İŞLETMEYİ İŞLE — tüm veri kaynakları paralel çekilir
// ============================================================
async function processBusiness(business) {
  const [reviews, openingHours, attributes] = await Promise.all([
    // Yorumlar: ownerReply + authorReviewCount + authorLevel eklendi
    prisma.externalReview.findMany({
      where: { businessId: business.id, content: { not: null } },
      select: {
        rating: true,
        content: true,
        authorLevel: true,
        authorReviewCount: true,  // YENİ
        ownerReply: true,          // YENİ
      },
      orderBy: { publishedAt: 'desc' },
      take: CONFIG.maxReviewsPerBiz,
    }),
    // Çalışma saatleri
    prisma.openingHours.findMany({
      where: { businessId: business.id },
      select: { day: true, openTime: true, closeTime: true },
    }),
    // Attribute tablosu (yapılandırılmış özellikler) — YENİ
    prisma.attribute.findMany({
      where: { businessId: business.id },
      select: { name: true },
    }),
  ])

  const raw = await callOllama(
    buildPrompt(business, reviews, openingHours, attributes, business.parentCategorySlug)
  )
  const result = parseJsonResponse(raw)

  if (!result.etiketler || !result.qa || !Array.isArray(result.qa)) {
    throw new Error('Eksik alan: etiketler veya qa yok')
  }

  const currentAttrs = business.attributes || {}
  const newAttrs = {
    ...currentAttrs,
    ai: {
      etiketler: result.etiketler,
      ozellikler: result.ozellikler || [],
      ozet: result.ozet || '',
      processedAt: new Date().toISOString(),
      model: CONFIG.model,
    },
  }

  await prisma.$transaction([
    prisma.business.update({
      where: { id: business.id },
      data: { attributes: newAttrs, updatedAt: new Date() },
    }),
    prisma.businessQA.deleteMany({ where: { businessId: business.id } }),
    prisma.businessQA.createMany({
      data: result.qa
        .filter(q => q.soru && q.cevap)
        .slice(0, 10)
        .map(q => ({
          businessId: business.id,
          question: q.soru,
          answer: q.cevap,
          category: q.kategori || null,
          confidence: null,
        })),
    }),
  ])

  return {
    qaCount: result.qa.length,
    etiketler: result.etiketler,
    ornekQA: result.qa[0] || null,
    hasHours: openingHours.length > 0,
    hasOwnerReply: reviews.some(r => r.ownerReply),
    attributeCount: attributes.length,
  }
}

// ============================================================
// SONUÇ YAZDIR
// ============================================================
function printResult(biz, res, processed, total, startTime, succeeded) {
  const pct = Math.round((processed / total) * 100)

  if (res.status === 'fulfilled') {
    const d = res.value
    const badges = [
      d.hasHours ? '🕐' : '',
      d.hasOwnerReply ? '💬' : '',
      d.attributeCount > 0 ? `🏷${d.attributeCount}` : '',
    ].filter(Boolean).join(' ')

    console.log(
      C.green + '  ✓ ' + C.reset +
      C.bold + biz.name.slice(0, 32).padEnd(33) + C.reset +
      C.gray + (biz.city || '').slice(0, 10).padEnd(11) + C.reset +
      C.yellow + `${d.qaCount} Q&A` + C.reset +
      (badges ? C.gray + '  ' + badges + C.reset : '')
    )
    if (d.etiketler) {
      const et = d.etiketler
      console.log(
        C.gray + '    └ ' +
        C.cyan + (et.atmosfer || '?') + C.gray + ' · ' +
        C.cyan + (et.hiz || '?') + C.gray + ' · ' +
        C.cyan + (et.fiyat_kalite || '?') + C.gray + ' · ' +
        C.cyan + (et.genel_deneyim || '?') + C.reset
      )
    }
    if (d.ornekQA) {
      console.log(C.gray + `    ❓ ${d.ornekQA.soru.slice(0, 60)}` + C.reset)
      console.log(C.gray + `    💬 ${d.ornekQA.cevap.slice(0, 80)}${d.ornekQA.cevap.length > 80 ? '…' : ''}` + C.reset)
    }
  } else {
    console.log(
      C.red + '  ✗ ' + C.reset +
      C.bold + biz.name.slice(0, 32).padEnd(33) + C.reset +
      C.red + (res.reason?.message || 'Bilinmeyen hata').slice(0, 45) + C.reset
    )
  }

  const elapsed = (Date.now() - startTime) / 1000
  const rate = (succeeded / (elapsed || 1) * 60).toFixed(1)
  const eta = total > processed
    ? ((total - processed) / (succeeded / (elapsed || 1)) / 60).toFixed(0)
    : 0

  process.stdout.write(
    '\r  ' + bar(processed, total) +
    C.bold + ` ${pct}%` + C.reset +
    C.gray + `  [${processed}/${total}]  ${rate}/dk  ETA ~${eta}dk     ` + C.reset
  )

  if (processed % CONFIG.batchSize === 0 || processed === total) {
    process.stdout.write('\n\n')
  }
}

// ============================================================
// ANA PIPELINE
// ============================================================
async function main() {
  const args = process.argv.slice(2)
  const limitArg    = args.includes('--limit')    ? parseInt(args[args.indexOf('--limit') + 1]) : null
  const categoryArg = args.includes('--category') ? args[args.indexOf('--category') + 1] : null
  const resume      = args.includes('--resume')

  console.clear()
  console.log(C.bold + C.cyan + '╔══════════════════════════════════════════════════╗' + C.reset)
  console.log(C.bold + C.cyan + '║   tecrubelerim.com  —  AI Zenginleştirme         ║' + C.reset)
  console.log(C.bold + C.cyan + '╚══════════════════════════════════════════════════╝' + C.reset)
  console.log()
  console.log(C.gray + '  Model    : ' + C.white + CONFIG.model + C.reset)
  console.log(C.gray + '  Batch    : ' + C.white + CONFIG.batchSize + ' paralel' + C.reset)
  console.log(C.gray + '  Mod      : ' + C.white + (resume ? '▶ Resume' : '⟳ Tam') + C.reset)
  console.log(C.gray + '  Veri     : ' + C.white + 'yorumlar + saatler + özellikler + açıklama + fiyat + işletme yanıtları' + C.reset)
  if (categoryArg) console.log(C.gray + '  Kategori : ' + C.yellow + categoryArg + C.reset)
  if (limitArg)    console.log(C.gray + '  Limit    : ' + C.yellow + limitArg + C.reset)
  console.log()

  const rawBusinesses = await prisma.business.findMany({
    where: {
      isActive: true, isDeleted: false,
      totalReviews: { gte: 25 },
      ...(categoryArg ? { category: { OR: [{ slug: categoryArg }, { parent: { slug: categoryArg } }] } } : {}),
    },
    select: {
      id: true, name: true, city: true, district: true,
      averageRating: true, totalReviews: true,
      attributes: true,
      description: true,   // YENİ
      category: { select: { slug: true, name: true, parent: { select: { slug: true } } } },
    },
    orderBy: { totalReviews: 'desc' },
    ...(limitArg ? { take: limitArg } : {}),
  })

  const businesses = rawBusinesses.map(b => ({
    ...b,
    categorySlug: b.category?.slug || null,
    categoryName: b.category?.name || null,
    parentCategorySlug: b.category?.parent?.slug || null,
  }))

  const toProcess = resume
    ? businesses.filter(b => { try { return !b.attributes?.ai?.processedAt } catch { return true } })
    : businesses

  console.log(C.bold + `  Toplam   : ${businesses.length} işletme` + C.reset)
  if (resume) console.log(C.gray + `  Atlanan  : ${businesses.length - toProcess.length} (zaten işlenmiş)` + C.reset)
  console.log(C.bold + C.green + `  İşlenecek: ${toProcess.length} işletme` + C.reset)
  console.log()
  console.log(C.gray + '  🕐 = çalışma saati var  💬 = işletme yanıtı var  🏷 = yapılandırılmış özellik sayısı' + C.reset)
  console.log(C.gray + '─'.repeat(52) + C.reset)
  console.log()

  let processed = 0, succeeded = 0, failed = 0
  const errors = []
  const startTime = Date.now()

  for (let i = 0; i < toProcess.length; i += CONFIG.batchSize) {
    const batch = toProcess.slice(i, i + CONFIG.batchSize)

    await Promise.all(
      batch.map(async (biz) => {
        const res = await processBusiness(biz).then(
          value => ({ status: 'fulfilled', value }),
          reason => ({ status: 'rejected', reason })
        )
        processed++
        if (res.status === 'fulfilled') succeeded++
        else {
          failed++
          errors.push({ id: biz.id, name: biz.name, error: res.reason?.message })
        }
        printResult(biz, res, processed, toProcess.length, startTime, succeeded)
      })
    )

    if (i + CONFIG.batchSize < toProcess.length) {
      await new Promise(r => setTimeout(r, CONFIG.delayBetweenBatches))
    }
  }

  const totalSec = ((Date.now() - startTime) / 1000).toFixed(0)
  const totalMin = (totalSec / 60).toFixed(1)

  console.log(C.gray + '─'.repeat(52) + C.reset)
  console.log()
  console.log(C.bold + C.cyan + '  ✅ TAMAMLANDI' + C.reset)
  console.log(C.gray + `  Süre      : ${totalMin} dakika` + C.reset)
  console.log(C.green + `  Başarılı  : ${succeeded}` + C.reset)
  if (failed > 0) console.log(C.red + `  Başarısız : ${failed}` + C.reset)
  console.log()

  if (errors.length > 0) {
    require('fs').writeFileSync('enrich-errors.json', JSON.stringify(errors, null, 2), 'utf8')
    console.log(C.yellow + '  ⚠ Hatalar enrich-errors.json dosyasına yazıldı.' + C.reset)
    console.log(C.gray + '  Tekrar: node enrich-pipeline.cjs --resume' + C.reset)
    console.log()
  }

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(C.red + 'Kritik hata:' + C.reset, e)
  await prisma.$disconnect()
  process.exit(1)
})
