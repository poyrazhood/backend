// enrich-pipeline-v2.cjs — tecrubelerim.com AI Zenginleştirme Pipeline
//
// Tier sistemi:
//   Tier 1 (>=10 yorum) → Yorumlardan zengin QA + etiket
//   Tier 2 (3-9 yorum)  → Az yorumla desteklenmiş QA
//   Tier 3 (0-2 yorum)  → Sadece metadata/kategori bilgisiyle genel QA
//
// Kullanım:
//   node enrich-pipeline-v2.cjs                        (tümü)
//   node enrich-pipeline-v2.cjs --resume               (kaldığı yerden)
//   node enrich-pipeline-v2.cjs --tier=1               (sadece tier 1)
//   node enrich-pipeline-v2.cjs --limit=1000           (test)
//   node enrich-pipeline-v2.cjs --category=yeme-icme   (kategori filtresi)

const { PrismaClient } = require('@prisma/client')
const http = require('http')
const fs   = require('fs')
const ps   = require('./pipeline-status.cjs')

const prisma = new PrismaClient()

// ── Config ────────────────────────────────────────────────────────────────────
const CONFIG = {
  model:               'llama3.1:8b',
  batchSize:           1,
  maxReviewsPerBiz:    10,
  qaCount:             5,
  timeoutMs:           60_000,
  delayBetweenBatches: 0,
}
const STATUS_INTERVAL_MS = 30_000

// ── CLI args ──────────────────────────────────────────────────────────────────
const argv      = process.argv.slice(2)
const getArg    = (name) => { const i = argv.indexOf(`--${name}`); return i !== -1 ? argv[i+1] : null }
const hasFlag   = (name) => argv.includes(`--${name}`)
const limitArg      = getArg('limit')    ? parseInt(getArg('limit'))    : null
const categoryArg   = getArg('category') || null
const tierArg       = getArg('tier')     ? parseInt(getArg('tier'))     : null  // 1, 2, 3 veya null=hepsi
const resume        = hasFlag('resume')

// ── Terminal renkleri ─────────────────────────────────────────────────────────
const C = {
  reset:'\x1b[0m', bold:'\x1b[1m', green:'\x1b[32m', red:'\x1b[31m',
  yellow:'\x1b[33m', cyan:'\x1b[36m', gray:'\x1b[90m', blue:'\x1b[34m',
  magenta:'\x1b[35m',
}

function bar(filled, total, width = 28) {
  const pct = total > 0 ? Math.round((filled / total) * width) : 0
  return C.green + '█'.repeat(pct) + C.gray + '░'.repeat(width - pct) + C.reset
}

// ── Kategori bilgi bankası ────────────────────────────────────────────────────
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

// Tier 3 için kategori bazlı hazır sorular (yorum olmadığında kullanılır)
const TIER3_QA_TEMPLATES = {
  'yeme-icme': [
    { soru: 'Rezervasyon gerekli mi?',               cevap: 'Kesin bilgi için işletmeyi arayarak öğrenmenizi öneririz.' },
    { soru: 'Paket servis seçeneği var mı?',         cevap: 'Paket servis hakkında bilgi için işletmeyle iletişime geçebilirsiniz.' },
    { soru: 'Vejetaryen seçenekler mevcut mu?',      cevap: 'Menü detayları için işletmeyi doğrudan aramanızı öneririz.' },
    { soru: 'Çocuklar için uygun mu?',               cevap: 'Aile dostu olup olmadığını öğrenmek için işletmeye danışabilirsiniz.' },
    { soru: 'Kredi kartı kabul ediliyor mu?',        cevap: 'Ödeme seçenekleri için işletmeye önceden sormanızı tavsiye ederiz.' },
  ],
  'guzellik-bakim': [
    { soru: 'Randevu almak gerekiyor mu?',           cevap: 'Randevu sistemi hakkında işletmeyi arayarak bilgi alabilirsiniz.' },
    { soru: 'Hangi hizmetler sunuluyor?',            cevap: 'Sunulan hizmetlerin tam listesi için işletmeyle iletişime geçin.' },
    { soru: 'Fiyat aralığı nasıl?',                  cevap: 'Güncel fiyat bilgisi için işletmeyi aramanızı öneririz.' },
    { soru: 'Erkek müşteri kabul ediliyor mu?',      cevap: 'Bu konuda kesin bilgi için işletmeye danışmanızı tavsiye ederiz.' },
    { soru: 'Çalışma saatleri nedir?',               cevap: 'Güncel çalışma saatleri için işletmeyle iletişime geçin.' },
  ],
  'saglik-medikal': [
    { soru: 'SGK kabul ediliyor mu?',                cevap: 'Sigorta ve SGK bilgileri için lütfen işletmeyi arayın.' },
    { soru: 'Randevu nasıl alınır?',                 cevap: 'Randevu sistemi için işletmenin iletişim numarasını kullanabilirsiniz.' },
    { soru: 'Acil hastalar kabul ediliyor mu?',      cevap: 'Acil durum kabul politikası için işletmeyi arayarak öğrenebilirsiniz.' },
    { soru: 'Bekleme süresi ne kadar?',              cevap: 'Bekleme süresi randevu ve yoğunluğa göre değişebilir.' },
    { soru: 'Online konsültasyon imkanı var mı?',    cevap: 'Online hizmet seçenekleri için işletmeyle iletişime geçin.' },
  ],
  'konaklama': [
    { soru: 'Kahvaltı fiyata dahil mi?',             cevap: 'Kahvaltı dahil olup olmadığı için rezervasyon sırasında sorabilirsiniz.' },
    { soru: 'Evcil hayvan kabul ediliyor mu?',       cevap: 'Evcil hayvan politikası için işletmeye önceden danışın.' },
    { soru: 'Ücretsiz otopark var mı?',              cevap: 'Otopark imkanı için check-in öncesinde işletmeyle iletişime geçin.' },
    { soru: 'Check-in saati nedir?',                 cevap: 'Check-in ve check-out saatleri için rezervasyon onayınızı kontrol edin.' },
    { soru: 'WiFi ücretsiz mi?',                     cevap: 'İnternet bağlantısı hakkında bilgi için işletmeye sorun.' },
  ],
  'egitim': [
    { soru: 'Deneme dersi imkanı var mı?',           cevap: 'Deneme dersi seçeneği için işletmeyle iletişime geçebilirsiniz.' },
    { soru: 'Grup dersi mi bireysel ders mi?',       cevap: 'Ders formatı hakkında bilgi almak için kurumla görüşebilirsiniz.' },
    { soru: 'Taksit imkanı var mı?',                 cevap: 'Ödeme seçenekleri için kayıt aşamasında sorabilirsiniz.' },
    { soru: 'Online ders seçeneği mevcut mu?',       cevap: 'Online eğitim imkanı için kurumu arayarak öğrenebilirsiniz.' },
    { soru: 'Sertifika veriliyor mu?',               cevap: 'Sertifika programları hakkında bilgi için kurumla iletişime geçin.' },
  ],
  'hizmetler': [
    { soru: 'Evde hizmet veriliyor mu?',             cevap: 'Yerinde hizmet seçeneği için işletmeyi arayarak öğrenebilirsiniz.' },
    { soru: 'Garanti süresi var mı?',                cevap: 'Garanti koşulları için işletmeye danışmanızı öneririz.' },
    { soru: 'Acil servis mevcut mu?',                cevap: 'Acil hizmet talebi için işletmenin iletişim bilgilerini kullanın.' },
    { soru: 'Fiyat teklifi alınabiliyor mu?',        cevap: 'Ücretsiz keşif ve fiyat teklifi için işletmeyle iletişime geçin.' },
    { soru: 'Çalışma saatleri nedir?',               cevap: 'Güncel çalışma saatleri için işletmeyi aramanızı tavsiye ederiz.' },
  ],
  'alisveris': [
    { soru: 'Çalışma saatleri nedir?',               cevap: 'Güncel saatler için mağazayı önceden aramanızı öneririz.' },
    { soru: 'Taksit imkanı var mı?',                 cevap: 'Taksit seçenekleri için kasiyere veya satış temsilcisine sorabilirsiniz.' },
    { soru: 'İade politikası nasıl?',                cevap: 'İade ve değişim koşulları için satın alım öncesi bilgi alın.' },
    { soru: 'Otopark ücretsiz mi?',                  cevap: 'Otopark imkanı için mağazayı önceden arayabilirsiniz.' },
    { soru: 'Online alışveriş seçeneği var mı?',     cevap: 'Dijital alışveriş kanalları için mağazanın web sitesini kontrol edin.' },
  ],
  'eglence-kultur': [
    { soru: 'Bilet fiyatları ne kadar?',             cevap: 'Güncel bilet fiyatları için resmi web sitesini veya gişeyi kontrol edin.' },
    { soru: 'Önceden rezervasyon gerekli mi?',       cevap: 'Rezervasyon politikası için etkinlik düzenleyiciyle iletişime geçin.' },
    { soru: 'Çocuklar için indirim var mı?',         cevap: 'Yaş gruplarına göre indirimler için bilet satış noktasını arayın.' },
    { soru: 'Ulaşım nasıl sağlanır?',               cevap: 'Toplu taşıma ve otopark bilgisi için mekanın web sitesini ziyaret edin.' },
    { soru: 'Engelli erişimi mevcut mu?',            cevap: 'Erişilebilirlik imkanları için mekanla önceden iletişime geçin.' },
  ],
  'evcil-hayvan': [
    { soru: 'Hangi hayvanlar için hizmet veriliyor?', cevap: 'Hizmet verilen hayvan türleri için kliniği veya mağazayı arayın.' },
    { soru: 'Randevu zorunlu mu?',                   cevap: 'Randevu sistemi için işletmeyi önceden aramanızı öneririz.' },
    { soru: 'Acil veteriner hizmeti var mı?',        cevap: 'Acil durum hizmetleri için klinikteki telefon numarasını kullanın.' },
    { soru: 'Konaklama/pansiyon hizmeti sunuluyor mu?', cevap: 'Evcil hayvan oteli imkanı için işletmeyle iletişime geçin.' },
    { soru: 'Aşı ve sağlık hizmetleri mevcut mu?',  cevap: 'Sağlık hizmetleri paketi için veteriner klinikleriyle iletişime geçin.' },
  ],
  'ulasim': [
    { soru: '7/24 hizmet veriliyor mu?',             cevap: 'Hizmet saatleri için işletmeyi arayarak öğrenebilirsiniz.' },
    { soru: 'Online rezervasyon yapılabiliyor mu?',  cevap: 'Dijital rezervasyon için işletmenin web sitesini ziyaret edin.' },
    { soru: 'Sigorta hizmet kapsamında mı?',         cevap: 'Sigorta detayları için sözleşme koşullarını incelemenizi öneririz.' },
    { soru: 'Fiyatlar nasıl belirleniyor?',          cevap: 'Güncel tarife bilgisi için işletmeyle iletişime geçin.' },
    { soru: 'Hangi bölgelere hizmet veriliyor?',     cevap: 'Hizmet bölgesi için işletmeyi aramanızı tavsiye ederiz.' },
  ],
}

// Genel fallback (kategori eşleşmezse)
const TIER3_GENERIC_QA = [
  { soru: 'Çalışma saatleri nedir?',                cevap: 'Güncel çalışma saatleri için işletmeyi aramanızı öneririz.' },
  { soru: 'İletişime nasıl geçilebilir?',           cevap: 'Randevu veya bilgi almak için işletmenin telefon numarasını kullanabilirsiniz.' },
  { soru: 'Ödeme seçenekleri nelerdir?',            cevap: 'Kredi kartı ve nakit kabul hakkında bilgi için işletmeye önceden sorun.' },
  { soru: 'Otopark imkanı var mı?',                 cevap: 'Otopark bilgisi için işletmeyle iletişime geçebilirsiniz.' },
  { soru: 'Fiyat aralığı nasıl?',                   cevap: 'Güncel fiyat bilgisi için işletmeyi arayarak öğrenebilirsiniz.' },
]

const PRICE_LABELS = { '$': 'Uygun fiyatlı', '$$': 'Orta fiyatlı', '$$$': 'Pahalı', '$$$$': 'Çok pahalı' }

// ── Tier belirleme ────────────────────────────────────────────────────────────
function getTier(reviewCount) {
  if (reviewCount >= 10) return 1
  if (reviewCount >= 3)  return 2
  return 3
}

// ── Prompt builder — Tier 1 & 2 ──────────────────────────────────────────────
function buildPromptT1T2(biz, reviews, openingHours, attributes, categorySlug, tier) {
  const filteredReviews = reviews.filter(r => r.content && r.content.length > 30).slice(0, CONFIG.maxReviewsPerBiz)

  const reviewText = filteredReviews.map((r, i) => {
    const badge = r.authorLevel?.includes('Yerel Rehber') ? '[YerelRehber]' :
                  r.authorReviewCount > 50 ? '[DeneyimliYazar]' : ''
    const stars = r.rating ? `${r.rating}★` : ''
    return `${i+1}. ${badge}${stars} ${r.content}${r.ownerReply ? ` [İşletme yanıtı: ${r.ownerReply}]` : ''}`
  }).join('\n')

  const attrObj     = typeof attributes === 'string' ? JSON.parse(attributes || '{}') : (attributes || {})
  const priceRange  = attrObj.priceRange || ''
  const ozellikler  = [].concat(attrObj.features||[], attrObj.highlights||[], attrObj.tags||[], attrObj.services||[]).map(String)
  const ozellikText = ozellikler.slice(0, 20).join(', ')
  const hoursText   = openingHours.map(h => `${h.day}: ${h.openTime}-${h.closeTime}`).join(', ')
  const categoryHint   = CATEGORY_HINTS[categorySlug] || 'hizmet kalitesi, fiyat, konum, temizlik'
  const requiredQA     = CATEGORY_REQUIRED_QA[categorySlug] || []

  const tierNote = tier === 2
    ? `NOT: Yorum sayısı az (${reviews.length} yorum). Emin olmadığın bilgileri mutlaka "Sınırlı sayıda yoruma göre..." veya "Kesin bilgi için işletmeyi aramanızı öneririz." ile belirt.`
    : ''

  return `İşletme: ${biz.name}
Kategori: ${biz.categoryName || categorySlug || 'genel'}
Konum: ${[biz.district, biz.city].filter(Boolean).join(', ')}
Puan: ${biz.averageRating || '?'}/5 (${biz.totalReviews || 0} yorum)
${hoursText   ? `Çalışma saatleri: ${hoursText}` : ''}
${priceRange  ? `Fiyat aralığı: ${PRICE_LABELS[priceRange] || priceRange}` : ''}
${ozellikText ? `Özellikler: ${ozellikText}` : ''}
${biz.description ? `Açıklama: ${biz.description}` : ''}
${tierNote}

Müşteri Yorumları:
${reviewText}

${requiredQA.length > 0 ? `Bu kategori için MUTLAKA cevaplanacak sorular: ${requiredQA.join(', ')}` : ''}
Odaklanılacak konular: ${categoryHint}

Görev: Bu işletme için müşterilerin en çok merak ettiği ${CONFIG.qaCount} soru-cevap üret.
Kurallar:
- Her soru birbirinden FARKLI bir konuya odaklanmalı (fiyat, bekleme süresi, park, menü, personel vb.)
- Cevaplar yorumlarda geçen SOMUT ve SPESİFİK bilgileri içermeli — "iyi hizmet" gibi genel ifadeler YETERSİZ
- Yorumlarda fiyat, süre, isim, yer gibi somut detaylar varsa MUTLAKA cevaba yansıt
- "Hizmet kalitesi çok iyi" veya "çalışanlar güler yüzlü" gibi KALIP cümleler YASAK
- Her cevap 2-3 cümle olmalı, işletme adını kullan, "Bu işletme" deme
- Emin olmadığın bilgileri "Yorumlara göre..." ile başlat ama ardından somut detay ver

Ayrıca kısa etiketler üret:
- atmosfer, hiz, fiyat_kalite, genel_deneyim

Yanıtı SADECE şu JSON formatında ver:
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
}

// ── Tier 3 — metadata prompt ──────────────────────────────────────────────────
function buildPromptT3(biz, openingHours, attributes, categorySlug) {
  const attrObj     = typeof attributes === 'string' ? JSON.parse(attributes || '{}') : (attributes || {})
  const priceRange  = attrObj.priceRange || ''
  const ozellikler  = [].concat(attrObj.features||[], attrObj.highlights||[], attrObj.tags||[], attrObj.services||[]).map(String)
  const ozellikText = ozellikler.slice(0, 15).join(', ')
  const hoursText   = openingHours.map(h => `${h.day}: ${h.openTime}-${h.closeTime}`).join(', ')
  const categoryHint = CATEGORY_HINTS[categorySlug] || 'hizmet kalitesi, fiyat, konum, temizlik'
  const requiredQA   = CATEGORY_REQUIRED_QA[categorySlug] || []

  return `İşletme: ${biz.name}
Kategori: ${biz.categoryName || categorySlug || 'genel'}
Konum: ${[biz.district, biz.city].filter(Boolean).join(', ')}
${hoursText   ? `Çalışma saatleri: ${hoursText}` : ''}
${priceRange  ? `Fiyat aralığı: ${PRICE_LABELS[priceRange] || priceRange}` : ''}
${ozellikText ? `Özellikler: ${ozellikText}` : ''}
${biz.description ? `Açıklama: ${biz.description}` : ''}

NOT: Bu işletme için henüz müşteri yorumu bulunmuyor. Yukarıdaki bilgileri kullanarak ziyaretçiye GERÇEKTEN YARDIMCI olacak cevaplar üret.
Kurallar:
- Özellikler listesindeki bilgileri (otopark, wifi, randevu, ödeme vb.) cevaplara DOĞRUDAN yansıt
- Çalışma saatleri varsa mutlaka ilgili soruda belirt
- Fiyat aralığı varsa fiyat sorusunda kullan
- "İşletmeyi arayın" cevabı sadece gerçekten bilinmeyen konular için kullan — her soruda kullanma
- Konum bilgisini (${[biz.district, biz.city].filter(Boolean).join(', ')}) cevaplarda değerlendir
- Cevaplar 1-2 cümle, net ve bilgilendirici olmalı

${requiredQA.length > 0 ? `Bu kategori için MUTLAKA cevaplanacak sorular: ${requiredQA.join(', ')}` : ''}
Odaklanılacak konular: ${categoryHint}

Görev: Bu ${biz.categoryName || 'işletme'} için ziyaretçilerin en çok merak ettiği ${CONFIG.qaCount} soru-cevap üret.

Yanıtı SADECE şu JSON formatında ver:
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
}

// ── Tier 3 template fallback (Ollama başarısız olursa) ────────────────────────
function getTemplateQA(categorySlug) {
  return TIER3_QA_TEMPLATES[categorySlug] || TIER3_GENERIC_QA
}

// ── Ollama ────────────────────────────────────────────────────────────────────
function callOllama(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: CONFIG.model,
      prompt,
      stream: false,
      options: { temperature: 0.7, num_predict: 1500 }
    })
    const req = http.request(
      { hostname: '127.0.0.1', port: 11434, path: '/api/generate', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let data = ''
        res.on('data', c => data += c)
        res.on('end', () => {
          try { resolve(JSON.parse(data).response || '') }
          catch (e) { reject(new Error('JSON parse hatası: ' + data.slice(0, 100))) }
        })
      }
    )
    req.setTimeout(CONFIG.timeoutMs, () => { req.destroy(); reject(new Error('Ollama timeout')) })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

function parseResponse(raw) {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('JSON bulunamadı')
  const parsed = JSON.parse(match[0])
  if (!Array.isArray(parsed.qa)) throw new Error('qa array yok')
  return parsed
}

// ── DB yazma ──────────────────────────────────────────────────────────────────
async function saveQA(biz, validQA, etiketler, tier) {
  await prisma.$transaction([
    prisma.businessQA.deleteMany({ where: { businessId: biz.id } }),
    ...validQA.map(item => prisma.businessQA.create({
      data: { businessId: biz.id, question: item.soru, answer: item.cevap }
    }))
  ])

  const attrObj = typeof biz.attributes === 'object' ? biz.attributes : {}
  await prisma.business.update({
    where: { id: biz.id },
    data: {
      attributes: {
        ...attrObj,
        ai: {
          processedAt: new Date().toISOString(),
          qaCount:     validQA.length,
          model:       CONFIG.model,
          tier,
          etiketler:   etiketler || null,
        }
      }
    }
  })
}

// ── İşletme işleme ────────────────────────────────────────────────────────────
async function processBusiness(biz) {
  const [reviews, openingHours] = await Promise.all([
    prisma.externalReview.findMany({
      where:   { businessId: biz.id, content: { not: null } },
      select:  { content: true, rating: true, authorLevel: true, authorReviewCount: true, ownerReply: true, publishedAt: true },
      orderBy: { publishedAt: 'desc' },
      take:    CONFIG.maxReviewsPerBiz,
    }),
    prisma.openingHours.findMany({
      where:  { businessId: biz.id },
      select: { day: true, openTime: true, closeTime: true }
    }).catch(() => [])
  ])

  const categorySlug = biz.categorySlug || biz.parentCategorySlug || 'genel'
  const attributes   = biz.attributes || {}
  const tier         = getTier(reviews.length)

  // Tier 3 — önce Ollama'yı dene, başarısız olursa template kullan
  if (tier === 3) {
    try {
      const prompt   = buildPromptT3(biz, openingHours, attributes, categorySlug)
      const raw      = await callOllama(prompt)
      const result   = parseResponse(raw)
      const validQA  = result.qa.filter(i => i.soru && i.cevap && i.soru.length > 5 && i.cevap.length > 10)

      if (validQA.length >= 2) {
        await saveQA(biz, validQA, result.etiketler, 3)
        return { qaCount: validQA.length, tier: 3, source: 'ollama' }
      }
    } catch (_) {}

    // Ollama başarısız — template kullan
    const templateQA = getTemplateQA(categorySlug)
    await saveQA(biz, templateQA, null, 3)
    return { qaCount: templateQA.length, tier: 3, source: 'template' }
  }

  // Tier 1 & 2 — Ollama zorunlu
  const prompt  = buildPromptT1T2(biz, reviews, openingHours, attributes, categorySlug, tier)
  const raw     = await callOllama(prompt)
  const result  = parseResponse(raw)
  const validQA = result.qa.filter(i => i.soru && i.cevap && i.soru.length > 5 && i.cevap.length > 10)

  if (validQA.length < 2) throw new Error(`Yetersiz Q&A: ${validQA.length}`)

  await saveQA(biz, validQA, result.etiketler, tier)
  return { qaCount: validQA.length, tier, source: 'ollama', ornekQA: result.qa[0] }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.clear()
  console.log(C.bold + C.cyan + '╔══════════════════════════════════════════════════════╗' + C.reset)
  console.log(C.bold + C.cyan + '║   tecrubelerim.com  —  AI Zenginleştirme v2          ║' + C.reset)
  console.log(C.bold + C.cyan + '╚══════════════════════════════════════════════════════╝\n' + C.reset)
  console.log(`  Model    : ${C.yellow}${CONFIG.model}${C.reset}`)
  console.log(`  Resume   : ${resume ? C.green+'evet'+C.reset : C.gray+'hayır'+C.reset}`)
  console.log(`  Tier     : ${tierArg ? C.yellow+tierArg+C.reset : C.gray+'hepsi'+C.reset}`)
  console.log(`  Kategori : ${categoryArg || C.gray+'hepsi'+C.reset}\n`)

  // İşletmeleri çek
  const whereBase = {
    isActive:  true,
    isDeleted: false,
    ...(categoryArg ? { category: { OR: [{ slug: categoryArg }, { parent: { slug: categoryArg } }] } } : {}),
    ...(tierArg === 1 ? { totalReviews: { gte: 10 } } :
        tierArg === 2 ? { totalReviews: { gte: 3, lt: 10 } } :
        tierArg === 3 ? { totalReviews: { lt: 3 } } : {}),
  }

  console.log(C.gray + '  İşletmeler yükleniyor...' + C.reset)

  // İşlenmiş ID'leri DB'den çek (sadece id — utf8 sorunu yok)
  let processedIdSet = new Set()
  if (resume) {
    console.log(C.gray + '  Resume modu: islenmis ID ler sorgulanıyor...' + C.reset)
    const rows = await prisma.$queryRawUnsafe(
      `SELECT id FROM "Business" WHERE attributes->'ai'->>'processedAt' IS NOT NULL`
    )
    processedIdSet = new Set(rows.map(r => r.id))
    console.log(C.gray + `  ${processedIdSet.size.toLocaleString()} işletme zaten islenmis` + C.reset)
  }

  // Tüm işletmeleri attributes HARİÇ çek (utf8 hatası attributes'tan geliyor)
  const rawBiz = await prisma.business.findMany({
    where: whereBase,
    select: {
      id: true, name: true, city: true, district: true,
      averageRating: true, totalReviews: true, description: true,
      category: { select: { slug: true, name: true, parent: { select: { slug: true } } } }
    },
    orderBy: { totalReviews: 'desc' },
    ...(limitArg ? { take: limitArg } : {}),
  })

  // attributes'u ayrı ayrı çek — sadece işlenecekler için
  const filtered = resume
    ? rawBiz.filter(b => !processedIdSet.has(b.id))
    : rawBiz

  console.log(C.gray + `  ${filtered.length.toLocaleString()} işletme isleniyor...` + C.reset)

  // Sadece işlenecek işletmelerin attributes'unu çek (batch'ler halinde)
  const ATTR_BATCH = 500
  const attrMap = new Map()
  for (let i = 0; i < filtered.length; i += ATTR_BATCH) {
    const batchIds = filtered.slice(i, i + ATTR_BATCH).map(b => b.id)
    const attrRows = await prisma.$queryRawUnsafe(
      `SELECT id, attributes FROM "Business" WHERE id = ANY($1::text[])`,
      batchIds
    )
    for (const r of attrRows) {
      attrMap.set(r.id, typeof r.attributes === 'string' ? JSON.parse(r.attributes) : r.attributes)
    }
    process.stdout.write(`\r  Attributes yukleniyor: ${Math.min(i+ATTR_BATCH, filtered.length)}/${filtered.length}   `)
  }
  process.stdout.write('\n')

  const businesses = filtered.map(b => ({
    ...b,
    attributes:         attrMap.get(b.id) || null,
    categorySlug:       b.category?.slug || null,
    categoryName:       b.category?.name || null,
    parentCategorySlug: b.category?.parent?.slug || null,
  }))

  const toProcess = businesses

  // Tier dağılımı
  const t1Count = toProcess.filter(b => getTier(b.totalReviews) === 1).length
  const t2Count = toProcess.filter(b => getTier(b.totalReviews) === 2).length
  const t3Count = toProcess.filter(b => getTier(b.totalReviews) === 3).length

  console.log(C.bold + `  Toplam işletme  : ${businesses.length.toLocaleString()}` + C.reset)
  console.log(C.bold + C.green + `  İşlenecek       : ${toProcess.length.toLocaleString()}` + C.reset)
  console.log(C.gray + `  ├─ Tier 1 (≥10 yorum) : ${t1Count.toLocaleString()}` + C.reset)
  console.log(C.gray + `  ├─ Tier 2 (3-9 yorum) : ${t2Count.toLocaleString()}` + C.reset)
  console.log(C.gray + `  └─ Tier 3 (0-2 yorum) : ${t3Count.toLocaleString()}\n` + C.reset)

  if (toProcess.length === 0) {
    console.log('✅ Tüm işletmeler zaten işlenmiş!'); await prisma.$disconnect(); return
  }

  const run   = await ps.startRun({ pipeline: 'enrich', pid: process.pid, message: `Başladı — ${toProcess.length} işletme` })
  const runId = run.id

  let processed = 0, succeeded = 0, failed = 0
  let tierStats = { 1: 0, 2: 0, 3: { ollama: 0, template: 0 } }
  const errors    = []
  const startTime = Date.now()

  const statusInterval = setInterval(async () => {
    const elapsed = (Date.now() - startTime) / 1000
    const speed   = parseFloat((succeeded / Math.max(elapsed, 1)).toFixed(3))
    await ps.updateRun({ runId, pipeline: 'enrich', processed: succeeded, errors: failed,
      remaining: toProcess.length - processed, speedPerSec: speed,
      message: `${succeeded}/${toProcess.length} işletme zenginleştirildi` })
  }, STATUS_INTERVAL_MS)

  for (let i = 0; i < toProcess.length; i += CONFIG.batchSize) {
    const batch = toProcess.slice(i, i + CONFIG.batchSize)

    await Promise.all(batch.map(async (biz) => {
      const tier = getTier(biz.totalReviews || 0)
      let res

      try {
        const val = await processBusiness(biz)
        res = { status: 'fulfilled', value: val }
      } catch (reason) {
        res = { status: 'rejected', reason }
      }

      processed++
      if (res.status === 'fulfilled') {
        succeeded++
        const v = res.value
        if (v.tier === 1) tierStats[1]++
        else if (v.tier === 2) tierStats[2]++
        else if (v.source === 'template') tierStats[3].template++
        else tierStats[3].ollama++

        // Başarı satırı
        const tierColor = v.tier === 1 ? C.green : v.tier === 2 ? C.yellow : C.gray
        const srcLabel  = v.source === 'template' ? C.gray+'[tmpl]'+C.reset : ''
        process.stdout.write('\n')
        console.log(
          tierColor + `  T${v.tier} ` + C.reset +
          C.bold + biz.name.slice(0, 30).padEnd(31) + C.reset +
          C.gray + (biz.city||'').slice(0,10).padEnd(11) + C.reset +
          C.yellow + `${v.qaCount} Q&A` + C.reset + ' ' + srcLabel
        )
        if (v.ornekQA) {
          console.log(C.gray + `     ❓ ${v.ornekQA.soru.slice(0, 60)}` + C.reset)
          console.log(C.gray + `     💬 ${v.ornekQA.cevap.slice(0, 80)}` + C.reset)
        }
      } else {
        failed++
        errors.push({ id: biz.id, name: biz.name, tier, error: res.reason?.message })
        process.stdout.write('\n')
        console.log(C.red + `  ✗ ` + C.reset + C.bold + biz.name.slice(0,30).padEnd(31) + C.reset +
          C.red + (res.reason?.message||'?').slice(0,50) + C.reset)
      }

      // Progress bar
      const elapsed = (Date.now() - startTime) / 1000
      const rate    = (succeeded / Math.max(elapsed,1) * 60).toFixed(1)
      const eta     = toProcess.length > processed
        ? ((toProcess.length - processed) / (succeeded / Math.max(elapsed,1)) / 60).toFixed(0)
        : 0
      const pct = Math.round((processed / toProcess.length) * 100)
      process.stdout.write(
        '\r  ' + bar(processed, toProcess.length) +
        C.bold + ` ${pct}%` + C.reset +
        C.gray + `  [${processed}/${toProcess.length}]  ${rate}/dk  ETA ~${eta}dk  ` +
        `T1:${tierStats[1]} T2:${tierStats[2]} T3:${tierStats[3].ollama+tierStats[3].template}(tmpl:${tierStats[3].template})     ` + C.reset
      )
    }))

    if (i + CONFIG.batchSize < toProcess.length && CONFIG.delayBetweenBatches > 0)
      await new Promise(r => setTimeout(r, CONFIG.delayBetweenBatches))
  }

  clearInterval(statusInterval)
  const totalSec = ((Date.now() - startTime) / 1000).toFixed(0)

  console.log('\n\n' + C.bold + C.cyan + '  ✅ TAMAMLANDI' + C.reset)
  console.log(C.green  + `  Başarılı         : ${succeeded}` + C.reset)
  console.log(C.gray   + `  ├─ Tier 1 (AI)   : ${tierStats[1]}` + C.reset)
  console.log(C.gray   + `  ├─ Tier 2 (AI)   : ${tierStats[2]}` + C.reset)
  console.log(C.gray   + `  ├─ Tier 3 (AI)   : ${tierStats[3].ollama}` + C.reset)
  console.log(C.gray   + `  └─ Tier 3 (tmpl) : ${tierStats[3].template}` + C.reset)
  if (failed > 0) console.log(C.red + `  Başarısız        : ${failed}` + C.reset)
  console.log(C.yellow + `  Süre             : ${totalSec}sn` + C.reset)

  await ps.finishRun({
    runId, pipeline: 'enrich',
    status: failed > succeeded ? 'FAILED' : 'SUCCESS',
    processed: succeeded, errors: failed,
    message: `${succeeded} işletme zenginleştirildi (T1:${tierStats[1]} T2:${tierStats[2]} T3:${tierStats[3].ollama+tierStats[3].template})`
  })
  await ps.disconnect()

  if (errors.length > 0)
    fs.writeFileSync('enrich-v2-errors.json', JSON.stringify(errors, null, 2), 'utf8')

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(C.red + 'Kritik hata:' + C.reset, e)
  await ps.finishRun({ runId: null, pipeline: 'enrich', status: 'FAILED', message: e.message }).catch(() => {})
  await ps.disconnect().catch(() => {})
  await prisma.$disconnect()
  process.exit(1)
})
