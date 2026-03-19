// enrich-pipeline.cjs — tecrubelerim.com AI Zenginleştirme Pipeline
// pipeline-status entegrasyonu eklenmiş versiyon

const { PrismaClient } = require('@prisma/client')
const http = require('http')
const ps = require('./pipeline-status.cjs')

const prisma = new PrismaClient()

const CONFIG = {
  model: 'llama3.1:8b',
  batchSize: 1,
  maxReviewsPerBiz: 10,
  qaCount: 5,
  timeoutMs: 60000,
  delayBetweenBatches: 0,
}

const STATUS_INTERVAL_MS = 30_000;

const C = { reset:'\x1b[0m', bold:'\x1b[1m', green:'\x1b[32m', red:'\x1b[31m', yellow:'\x1b[33m', cyan:'\x1b[36m', gray:'\x1b[90m', white:'\x1b[37m' }

function bar(filled, total, width = 30) {
  const pct = Math.round((filled / total) * width)
  return C.green + '█'.repeat(pct) + C.gray + '░'.repeat(width - pct) + C.reset
}

const CATEGORY_HINTS = {
  'yeme-icme': 'rezervasyon, vejetaryen/vegan seçenek, çocuk menüsü, paket servis, alkol servisi, açık alan oturma, fiyat aralığı, özel gün organizasyonu',
  'guzellik-bakim': 'randevu zorunluluğu, erkek/kadın/karma kabul, hizmet süresi, kullanılan ürün markaları, fiyat aralığı, otopark, hijyen standartları',
  'saglik-medikal': 'SGK/sigorta kabul, randevu sistemi, bekleme süresi, uzman doktor kadrosu, acil kabul, muayene ücreti, online konsültasyon',
  'konaklama': 'check-in/check-out saati, kahvaltı dahil mi, evcil hayvan kabul, otopark, wifi kalitesi, havuz/spa, iptal politikası',
  'egitim': 'yaş ve seviye grupları, deneme dersi imkanı, grup veya bireysel ders, online seçenek, sertifika, ücret ve taksit',
  'hizmetler': 'evde/yerinde hizmet, fiyat teklifi, garanti süresi, çalışma saatleri, acil servis, ödeme yöntemleri',
  'alisveris': 'çalışma saatleri, ücretsiz kargo/iade politikası, taksit imkanı, indirim kartı, otopark, online sipariş',
  'eglence-kultur': 'bilet fiyatı, yaş kısıtlaması, çocuk indirimi, önceden rezervasyon, ulaşım, özel etkinlikler',
  'evcil-hayvan': 'hangi hayvan türleri kabul edilir, acil hizmet, konaklama/otelcilik, randevu sistemi, aşı ve bakım paketleri',
  'ulasim': '7/24 hizmet, online rezervasyon, ehliyet/belge gereksinimleri, sigorta dahil mi, teslimat ve teslim alma noktaları',
}

const CATEGORY_REQUIRED_QA = {
  'yeme-icme': ['Rezervasyon gerekli mi?', 'Vejetaryen veya vegan seçenek var mı?', 'Fiyat aralığı nedir?'],
  'guzellik-bakim': ['Randevu zorunlu mu?', 'Erkek müşteri kabul ediliyor mu?', 'Fiyat aralığı nedir?'],
  'saglik-medikal': ['SGK veya özel sigorta kabul ediliyor mu?', 'Randevu nasıl alınır?', 'Bekleme süresi ne kadar?'],
  'konaklama': ['Kahvaltı fiyata dahil mi?', 'Evcil hayvan kabul ediliyor mu?', 'Check-in/check-out saatleri nedir?'],
  'egitim': ['Deneme dersi imkanı var mı?', 'Grup mu bireysel mi ders veriliyor?', 'Ücretler ve taksit seçenekleri nedir?'],
  'hizmetler': ['Evde hizmet veriliyor mu?', 'Garanti süresi var mı?', 'Acil servis mevcut mu?'],
  'alisveris': ['Otopark ücretsiz mi?', 'İade politikası nasıl?', 'Taksit imkanı var mı?'],
  'eglence-kultur': ['Bilet fiyatı ne kadar?', 'Çocuklar için indirim var mı?', 'Önceden rezervasyon gerekli mi?'],
  'evcil-hayvan': ['Hangi hayvan türlerine hizmet veriliyor?', 'Acil hizmet mevcut mu?', 'Randevu zorunlu mu?'],
  'ulasim': ['7/24 hizmet veriliyor mu?', 'Online rezervasyon yapılabiliyor mu?', 'Sigorta dahil mi?'],
}

const PRICE_LABELS = { '$': 'Uygun fiyatlı', '$$': 'Orta fiyatlı', '$$$': 'Pahalı', '$$$$': 'Çok pahalı' }

function detectTopics(reviewText, hoursText, priceRange, tumOzellikler, categorySlug) {
  const t = reviewText.toLowerCase()
  const sorular = []
  if (hoursText) sorular.push({ soru: 'Çalışma saatleri nedir?', cevap_hint: `DB: ${hoursText}`, kategori: 'çalışma saatleri' })
  if (priceRange) sorular.push({ soru: 'Fiyat aralığı nasıl?', cevap_hint: `DB: ${PRICE_LABELS[priceRange] || priceRange}`, kategori: 'fiyat' })
  if (t.includes('otopark') || t.includes('park yeri')) sorular.push({ soru: 'Otopark imkanı var mı?', cevap_hint: 'yorumlardan', kategori: 'otopark' })
  if (t.includes('rezervasyon') || t.includes('randevu')) sorular.push({ soru: 'Rezervasyon gerekli mi?', cevap_hint: 'yorumlardan', kategori: 'rezervasyon' })
  if (t.includes('çocuk') || t.includes('aile') || t.includes('bebek')) sorular.push({ soru: 'Çocuklar ve aileler için uygun mu?', cevap_hint: 'yorumlardan', kategori: 'aile' })
  if (t.includes('engel') || t.includes('tekerlekli')) sorular.push({ soru: 'Engelli erişimi mevcut mu?', cevap_hint: 'yorumlardan', kategori: 'erişim' })
  if (t.includes('wifi') || t.includes('internet')) sorular.push({ soru: 'Ücretsiz WiFi var mı?', cevap_hint: 'yorumlardan', kategori: 'wifi' })
  if (t.includes('paket') || t.includes('sipariş') || t.includes('delivery')) sorular.push({ soru: 'Paket servis veya gel-al seçeneği var mı?', cevap_hint: 'yorumlardan', kategori: 'paket servis' })
  if (t.includes('vejetaryen') || t.includes('vegan')) sorular.push({ soru: 'Vejetaryen veya vegan seçenek var mı?', cevap_hint: 'yorumlardan', kategori: 'diyet' })
  if (t.includes('alkol') || t.includes('bira') || t.includes('şarap')) sorular.push({ soru: 'Alkollü içecek servisi yapılıyor mu?', cevap_hint: 'yorumlardan', kategori: 'alkol' })
  if (t.includes('kart') || t.includes('nakit') || t.includes('ödeme')) sorular.push({ soru: 'Kredi kartı ile ödeme yapılabiliyor mu?', cevap_hint: 'yorumlardan', kategori: 'ödeme' })
  if (t.includes('kuyruk') || t.includes('bekleme') || t.includes('kalabalık')) sorular.push({ soru: 'Yoğun saatlerde bekleme süresi ne kadar?', cevap_hint: 'yorumlardan', kategori: 'bekleme' })
  if (t.includes('köpek') || t.includes('kedi') || t.includes('evcil hayvan')) sorular.push({ soru: 'Evcil hayvanlar kabul ediliyor mu?', cevap_hint: 'yorumlardan', kategori: 'evcil hayvan' })
  const catExtras = {
    'konaklama': [{ soru: 'Kahvaltı fiyata dahil mi?', kategori: 'kahvaltı' }, { soru: 'Check-in/check-out saatleri nedir?', kategori: 'check-in' }],
    'saglik-medikal': [{ soru: 'SGK veya özel sigorta kabul ediliyor mu?', kategori: 'sigorta' }, { soru: 'Randevu nasıl alınır?', kategori: 'randevu' }],
    'egitim': [{ soru: 'Deneme dersi imkanı var mı?', kategori: 'deneme' }, { soru: 'Bireysel mi grup dersi mi veriliyor?', kategori: 'ders tipi' }],
    'eglence-kultur': [{ soru: 'Bilet fiyatı ne kadar?', kategori: 'bilet' }, { soru: 'Çocuklar için indirim var mı?', kategori: 'indirim' }],
    'guzellik-bakim': [{ soru: 'Erkek müşteri kabul ediliyor mu?', kategori: 'cinsiyet' }],
  }
  const extras = catExtras[categorySlug] || []
  for (const e of extras) { if (!sorular.find(s => s.kategori === e.kategori)) sorular.push({ ...e, cevap_hint: 'yorumlardan' }) }
  if (tumOzellikler.some(o => o.toLowerCase().includes('havuz') || o.toLowerCase().includes('spa'))) sorular.push({ soru: 'Havuz veya spa imkanı var mı?', cevap_hint: 'ozelliklerden', kategori: 'havuz' })
  const yedekler = [
    { soru: 'Genel temizlik ve hijyen nasıl?', kategori: 'hijyen' },
    { soru: 'Personel ilgisi ve hizmet kalitesi nasıl?', kategori: 'hizmet' },
    { soru: 'Fiyat/performans oranı nasıl?', kategori: 'fiyat_performans' },
    { soru: 'Ulaşım kolaylığı nasıl?', kategori: 'ulaşım' },
    { soru: 'Tekrar ziyaret eder misiniz?', kategori: 'tavsiye' },
  ]
  for (const y of yedekler) { if (sorular.length >= CONFIG.qaCount) break; if (!sorular.find(s => s.kategori === y.kategori)) sorular.push({ ...y, cevap_hint: 'yorumlardan' }) }
  return sorular.slice(0, CONFIG.qaCount)
}

function buildPrompt(business, reviews, openingHours, attributes, categorySlug) {
  const filteredReviews = reviews.filter(r => r.content && r.content.length > 30).slice(0, CONFIG.maxReviewsPerBiz)
  const reviewText = filteredReviews.length > 0 ? filteredReviews.map((r, i) => {
    const isLocal = r.authorLevel && r.authorLevel.includes('Yerel Rehber')
    const highCount = r.authorReviewCount && r.authorReviewCount > 50
    const badge = isLocal ? '[YerelRehber]' : highCount ? '[DeneyimliYazar]' : ''
    const stars = r.rating ? `${r.rating}★` : ''
    return `${i+1}. ${badge}${stars} ${r.content}${r.ownerReply ? ` [İşletme yanıtı: ${r.ownerReply}]` : ''}`
  }).join('\n') : 'Yorum yok.'

  const hoursText = openingHours.length > 0 ? openingHours.map(h => `${h.day}: ${h.openTime}-${h.closeTime}`).join(', ') : ''
  const attrObj = typeof attributes === 'string' ? JSON.parse(attributes || '{}') : (attributes || {})
  const priceRange = attrObj.priceRange || ''
  const tumOzellikler = [].concat(attrObj.features || [], attrObj.highlights || [], attrObj.tags || [], attrObj.services || []).map(String)
  const ozellikText = tumOzellikler.length > 0 ? tumOzellikler.slice(0, 20).join(', ') : ''
  const categoryHint = CATEGORY_HINTS[categorySlug] || 'hizmet kalitesi, fiyat, konum, temizlik'
  const requiredQA = CATEGORY_REQUIRED_QA[categorySlug] || []
  const sorular = detectTopics(reviewText, hoursText, priceRange, tumOzellikler, categorySlug)

  const prompt = `İşletme: ${business.name}
Kategori: ${business.categoryName || categorySlug || 'genel'}
Konum: ${[business.district, business.city].filter(Boolean).join(', ')}
Puan: ${business.averageRating || '?'}/5 (${business.totalReviews || 0} yorum)
${hoursText ? `Çalışma saatleri: ${hoursText}` : ''}
${priceRange ? `Fiyat aralığı: ${PRICE_LABELS[priceRange] || priceRange}` : ''}
${ozellikText ? `Özellikler: ${ozellikText}` : ''}
${business.description ? `Açıklama: ${business.description}` : ''}

Müşteri Yorumları:
${reviewText}

${requiredQA.length > 0 ? `Bu kategori için MUTLAKA cevaplanacak sorular: ${requiredQA.join(', ')}` : ''}
Odaklanılacak konular: ${categoryHint}

Görev: Yukarıdaki işletme için müşterilerin en çok merak ettiği ${CONFIG.qaCount} soru-cevap üret.
Kuralllar:
- Sorular GERÇEK müşteri sorularına benzemeli
- Cevaplar yorumlardan ve DB bilgilerden çıkarılmalı
- Emin olmadığın bilgileri "Yorumlara göre..." ile başlat
- Her cevap 1-3 cümle olmalı
- "Bu işletme" yerine işletme adını kullan

Ayrıca işletme için kısa etiketler üret:
- atmosfer: (örn: "Aile dostu", "Romantik", "İş toplantısı için uygun")
- hiz: (örn: "Hızlı servis", "Yavaş ama kaliteli")
- fiyat_kalite: (örn: "Paranızın karşılığı", "Pahalı ama lüks")
- genel_deneyim: (örn: "Kesinlikle tavsiye", "Duruma göre değişir")

Yanıtı SADECE şu JSON formatında ver, başka hiçbir şey yazma:
{
  "qa": [
    {"soru": "...", "cevap": "..."},
    {"soru": "...", "cevap": "..."},
    {"soru": "...", "cevap": "..."},
    {"soru": "...", "cevap": "..."},
    {"soru": "...", "cevap": "..."}
  ],
  "etiketler": {
    "atmosfer": "...",
    "hiz": "...",
    "fiyat_kalite": "...",
    "genel_deneyim": "..."
  }
}`
  return { prompt, sorular, hoursText, priceRange, tumOzellikler }
}

function callOllama(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: CONFIG.model, prompt, stream: false, options: { temperature: 0.3, num_predict: 1200 } })
    const req = http.request({ hostname: '127.0.0.1', port: 11434, path: '/api/generate', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { const parsed = JSON.parse(data); resolve(parsed.response || '') }
        catch (e) { reject(new Error('JSON parse hatası: ' + data.slice(0, 100))) }
      })
    })
    req.setTimeout(CONFIG.timeoutMs, () => { req.destroy(); reject(new Error('Ollama timeout')) })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

function parseResponse(raw) {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('JSON bulunamadı')
    const parsed = JSON.parse(jsonMatch[0])
    if (!Array.isArray(parsed.qa)) throw new Error('qa array yok')
    return parsed
  } catch (e) {
    throw new Error('Parse hatası: ' + e.message)
  }
}

async function processBusiness(biz) {
  const [reviews, openingHours] = await Promise.all([
    prisma.externalReview.findMany({ where: { businessId: biz.id, content: { not: null } }, select: { content: true, rating: true, authorLevel: true, authorReviewCount: true, ownerReply: true, publishedAt: true }, orderBy: { publishedAt: 'desc' }, take: CONFIG.maxReviewsPerBiz }),
    prisma.openingHour.findMany({ where: { businessId: biz.id }, select: { day: true, openTime: true, closeTime: true } }).catch(() => [])
  ])

  if (reviews.length < 3) throw new Error(`Yetersiz yorum: ${reviews.length}`)

  const categorySlug = biz.categorySlug || biz.parentCategorySlug || 'genel'
  const attributes = biz.attributes || {}
  const { prompt, sorular, hoursText, priceRange, tumOzellikler } = buildPrompt(biz, reviews, openingHours, attributes, categorySlug)

  const raw = await callOllama(prompt)
  const result = parseResponse(raw)

  const validQA = result.qa.filter(item => item.soru && item.cevap && item.soru.length > 5 && item.cevap.length > 10)
  if (validQA.length < 2) throw new Error(`Yetersiz Q&A: ${validQA.length}`)

  await prisma.$transaction([
    prisma.businessQA.deleteMany({ where: { businessId: biz.id } }),
    ...validQA.map((item, i) => prisma.businessQA.create({ data: { businessId: biz.id, question: item.soru, answer: item.cevap, order: i, source: 'ai', model: CONFIG.model } }))
  ])

  const attrUpdate = { ...(typeof biz.attributes === 'object' ? biz.attributes : {}), ai: { processedAt: new Date().toISOString(), qaCount: validQA.length, model: CONFIG.model, etiketler: result.etiketler || null } }
  await prisma.business.update({ where: { id: biz.id }, data: { attributes: attrUpdate } })

  return { qaCount: validQA.length, etiketler: result.etiketler, ornekQA: result.qa[0] || null, hasHours: openingHours.length > 0, hasOwnerReply: reviews.some(r => r.ownerReply), attributeCount: Object.keys(attributes).length }
}

function printResult(biz, res, processed, total, startTime, succeeded) {
  const pct = Math.round((processed / total) * 100)
  if (res.status === 'fulfilled') {
    const d = res.value
    console.log(C.green + '  ✓ ' + C.reset + C.bold + biz.name.slice(0, 32).padEnd(33) + C.reset + C.gray + (biz.city || '').slice(0, 10).padEnd(11) + C.reset + C.yellow + `${d.qaCount} Q&A` + C.reset)
    if (d.ornekQA) { console.log(C.gray + `    ❓ ${d.ornekQA.soru.slice(0, 60)}` + C.reset); console.log(C.gray + `    💬 ${d.ornekQA.cevap.slice(0, 80)}` + C.reset) }
  } else {
    console.log(C.red + '  ✗ ' + C.reset + C.bold + biz.name.slice(0, 32).padEnd(33) + C.reset + C.red + (res.reason?.message || 'Bilinmeyen hata').slice(0, 45) + C.reset)
  }
  const elapsed = (Date.now() - startTime) / 1000
  const rate = (succeeded / (elapsed || 1) * 60).toFixed(1)
  const eta = total > processed ? ((total - processed) / (succeeded / (elapsed || 1)) / 60).toFixed(0) : 0
  process.stdout.write('\r  ' + bar(processed, total) + C.bold + ` ${pct}%` + C.reset + C.gray + `  [${processed}/${total}]  ${rate}/dk  ETA ~${eta}dk     ` + C.reset)
  if (processed % CONFIG.batchSize === 0 || processed === total) process.stdout.write('\n\n')
}

async function main() {
  const args = process.argv.slice(2)
  const limitArg    = args.includes('--limit')    ? parseInt(args[args.indexOf('--limit') + 1]) : null
  const categoryArg = args.includes('--category') ? args[args.indexOf('--category') + 1] : null
  const resume      = args.includes('--resume')

  console.clear()
  console.log(C.bold + C.cyan + '╔══════════════════════════════════════════════════╗' + C.reset)
  console.log(C.bold + C.cyan + '║   tecrubelerim.com  —  AI Zenginleştirme         ║' + C.reset)
  console.log(C.bold + C.cyan + '╚══════════════════════════════════════════════════╝\n' + C.reset)

  const rawBusinesses = await prisma.business.findMany({
    where: { isActive: true, isDeleted: false, totalReviews: { gte: 25 }, ...(categoryArg ? { category: { OR: [{ slug: categoryArg }, { parent: { slug: categoryArg } }] } } : {}) },
    select: { id: true, name: true, city: true, district: true, averageRating: true, totalReviews: true, attributes: true, description: true, category: { select: { slug: true, name: true, parent: { select: { slug: true } } } } },
    orderBy: { totalReviews: 'desc' },
    ...(limitArg ? { take: limitArg } : {}),
  })

  const businesses = rawBusinesses.map(b => ({ ...b, categorySlug: b.category?.slug || null, categoryName: b.category?.name || null, parentCategorySlug: b.category?.parent?.slug || null }))
  const toProcess = resume ? businesses.filter(b => { try { return !b.attributes?.ai?.processedAt } catch { return true } }) : businesses

  console.log(C.bold + `  Toplam   : ${businesses.length} işletme` + C.reset)
  console.log(C.bold + C.green + `  İşlenecek: ${toProcess.length} işletme\n` + C.reset)

  const run = await ps.startRun({ pipeline: 'enrich', pid: process.pid, message: `Başladı — ${toProcess.length} işletme bekliyor` });
  const runId = run.id;

  let processed = 0, succeeded = 0, failed = 0
  const errors = []
  const startTime = Date.now()

  const statusInterval = setInterval(async () => {
    const elapsed = (Date.now() - startTime) / 1000;
    const speed = parseFloat((succeeded / Math.max(elapsed, 1)).toFixed(3));
    const remaining = toProcess.length - processed;
    await ps.updateRun({ runId, pipeline: 'enrich', processed: succeeded, errors: failed, remaining, speedPerSec: speed, message: `${succeeded}/${toProcess.length} işletme zenginleştirildi` });
  }, STATUS_INTERVAL_MS);

  for (let i = 0; i < toProcess.length; i += CONFIG.batchSize) {
    const batch = toProcess.slice(i, i + CONFIG.batchSize)
    await Promise.all(batch.map(async (biz) => {
      const res = await processBusiness(biz).then(value => ({ status: 'fulfilled', value }), reason => ({ status: 'rejected', reason }))
      processed++
      if (res.status === 'fulfilled') succeeded++
      else { failed++; errors.push({ id: biz.id, name: biz.name, error: res.reason?.message }) }
      printResult(biz, res, processed, toProcess.length, startTime, succeeded)
    }))
    if (i + CONFIG.batchSize < toProcess.length) await new Promise(r => setTimeout(r, CONFIG.delayBetweenBatches))
  }

  clearInterval(statusInterval);
  const totalSec = ((Date.now() - startTime) / 1000).toFixed(0)

  console.log(C.bold + C.cyan + '  ✅ TAMAMLANDI' + C.reset)
  console.log(C.green + `  Başarılı  : ${succeeded}` + C.reset)
  if (failed > 0) console.log(C.red + `  Başarısız : ${failed}` + C.reset)

  await ps.finishRun({ runId, pipeline: 'enrich', status: failed > succeeded ? 'FAILED' : 'SUCCESS', processed: succeeded, errors: failed, message: `${succeeded} işletme zenginleştirildi` });
  await ps.disconnect();

  if (errors.length > 0) require('fs').writeFileSync('enrich-errors.json', JSON.stringify(errors, null, 2), 'utf8')
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(C.red + 'Kritik hata:' + C.reset, e)
  await ps.finishRun({ runId: null, pipeline: 'enrich', status: 'FAILED', message: e.message }).catch(() => {})
  await ps.disconnect().catch(() => {})
  await prisma.$disconnect()
  process.exit(1)
})
