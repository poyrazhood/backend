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

const PRICE_LABELS = { '$': 'Uygun fiyatlı', '$$': 'Orta fiyatlı', '$$$': 'Pahalı', '$$$$': 'Çok pahalı' }

// ============================================================
// PROMPT — tüm 5 veri kaynağını kullanır
// ============================================================
function buildPrompt(business, reviews, openingHours, attributes, categorySlug) {
  const hints = CATEGORY_HINTS[categorySlug] || 'genel hizmet kalitesi, fiyat, müşteri memnuniyeti, çalışma saatleri, ulaşım, park imkanı'

  // 1) YORUMLAR: ownerReply + authorReviewCount + authorLevel
  const reviewText = reviews.length > 0
    ? reviews
        .filter(r => r.content && r.content.length > 30)
        .slice(0, CONFIG.maxReviewsPerBiz)
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

  // 3) ÖZELLİKLER: JSON attributes.about.Özellikler + Attribute tablosu (birleştirilmiş, tekrarsız)
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

  return `Sen tecrubelerim.com için çalışan bir Türkçe işletme analisti asistanısın.
Sana bir işletmenin bilgilerini ve gerçek müşteri yorumlarını veriyorum.
Bu bilgilere dayanarak aşağıdaki JSON'u üret.

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
    "atmosfer": "sakin",
    "hiz": "hızlı",
    "fiyat_kalite": "uygun",
    "genel_deneyim": "iyi"
  },
  "ozellikler": ["özellik1", "özellik2", "özellik3"],
  "ozet": "Bu işletmeyi 2-3 cümleyle anlatan Türkçe özet.",
  "qa": [
    { "soru": "Gerçek bir müşteri sorusu?", "cevap": "Yorumlara dayalı detaylı cevap.", "kategori": "fiyat" }
  ]
}

━━━ ZORUNLU KURALLAR ━━━
1. "etiketler" değerleri:
   - atmosfer    : sakin | kalabalık | romantik | aile_dostu | gençlik | karma
   - hiz         : çok_hızlı | hızlı | normal | yavaş | çok_yavaş
   - fiyat_kalite: çok_uygun | uygun | orta | pahalı | çok_pahalı
   - genel_deneyim: mükemmel | iyi | orta | kötü | çok_kötü

2. "qa" dizisinde tam olarak ${CONFIG.qaCount} adet soru-cevap olsun.

3. Soru kategorileri şunlardan seçilsin (düz metin, parantez olmadan):
   ${hints}

4. ÇALIŞMA SAATLERİ SORULURSA:
   ${hoursText
     ? `Kesinlikle bu bilgiyi kullan: "${hoursText}"`
     : `Çalışma saatleri veritabanında kayıtlı değil. Yorumlarda geçiyorsa yaz, yoksa "Çalışma saatleri bilgisi sistemimizde bulunmuyor." yaz.`
   }

5. İŞLETME YANITLARI:
   - Yorumların altında "→ İşletme yanıtı:" olarak işaretlenmiş cevaplar işletme sahibine ait.
   - Bu yanıtlarda telefon, rezervasyon, adres gibi spesifik bilgiler varsa Q&A'da kullan.

6. CEVAP KALİTESİ:
   - Her cevap en az 1 tam cümle olsun. Tek kelime cevap yasak.
   - [Yerel Rehber] ve çok yorumlu kullanıcıların bilgilerine daha fazla ağırlık ver.
   - Yorumlarda bilgi yoksa: "Müşteri yorumlarında bu konuda bilgi bulunmuyor." yaz.
   - FİYAT İÇEREN CEVAPLARA ZORUNLU: Her fiyat bilgisinin sonuna ekle: "(Bu bilgi müşteri yorumlarından alınmıştır, güncel olmayabilir.)"
   - Tahmin veya varsayım içeren cevap yazma.

7. Tüm metinler Türkçe olsun.
8. Sadece JSON döndür. Markdown veya açıklama ekleme.`
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
      options: { temperature: 0.2, top_p: 0.9, num_predict: 900 },
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
      totalReviews: { gte: 1 },
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
