// kategori-embedding.cjs
// Ana kategoriler için embedding üretir ve CategoryEmbedding tablosuna yazar
//
// Kullanım:
//   node kategori-embedding.cjs

const { PrismaClient } = require('@prisma/client')
const http = require('http')

const prisma = new PrismaClient()

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', red: '\x1b[31m',
  cyan: '\x1b[36m',  gray: '\x1b[90m',
  yellow: '\x1b[33m',
}

// Her kategori için embedding'e gönderilecek açıklayıcı metin
// Sadece slug değil, zengin Türkçe açıklama — daha iyi vektör üretir
const CATEGORY_DESCRIPTIONS = {
  // Alt kategoriler: kafeler, restoranlar, barlar, pastane, fast food, kahve çay, restoran, kafe
  'yeme-icme':      'restoran kafe yemek içmek lokanta pizza burger kebap kahvaltı akşam yemeği öğle yemeği fastfood bar gece hayatı pastane fırın tatlı çay kahve paket servis',

  // Alt kategoriler: spa masaj, kuaför berber, güzellik merkezi, dövme piercing, tırnak stüdyo
  'guzellik-bakim': 'kuaför güzellik salonu saç kesimi manikür pedikür cilt bakımı masaj spa epilasyon berber dövme piercing tırnak stüdyo bayan erkek güzellik merkezi',

  // Alt kategoriler: eczane, hastane acil, spor fitness, psikoloji terapi, diş sağlığı, klinik poliklinik
  'saglik-medikal': 'doktor hastane klinik sağlık diş hekimi eczane muayene tedavi ameliyat spor salonu fitness gym egzersiz pilates yoga psikoloji terapi psikolog poliklinik acil',

  // Alt kategoriler: otel, pansiyon hostel, apart kiralık
  'konaklama':      'otel motel pansiyon hostel apart konaklama oda rezervasyon geceleme tatil kiralık günlük daire suit',

  // Alt kategoriler: kurs dershane, dil okulu, müzik sanat kursları, okul lise, üniversite
  'egitim':         'okul kurs dershane eğitim öğretmen öğrenci sertifika dil kursu müzik kursu sanat kursu lise üniversite akademi özel ders',

  // Alt kategoriler: temizlik, oto servis yedek parça, muhasebe finans, hukuki hizmetler, tadilat inşaat, nakliyat taşımacılık
  'hizmetler':      'tamirci elektrikçi tesisatçı temizlik nakliyat hizmet usta tamir bakım servis oto servis yedek parça muhasebe mali müşavir avukat hukuk tadilat inşaat taşımacılık',

  // Alt kategoriler: elektronik teknoloji, avm alışveriş merkezi, kitap kırtasiye, ev mobilya, market süpermarket, giyim moda
  'alisveris':      'mağaza alışveriş market süpermarket giyim elektronik mobilya alışveriş merkezi avm kitap kırtasiye ev dekorasyon moda teknoloji telefon bilgisayar',

  // Alt kategoriler: düğün organizasyon, park doğa, müze galeri, sinema, oyun eğlence merkezi
  'eglence-kultur': 'sinema tiyatro müze park eğlence konser etkinlik gezi kültür sanat düğün salonu organizasyon düğün organizasyon nikah balo davet doğa piknik oyun merkezi galeri sergi',

  // Alt kategoriler: veteriner, pet shop, hayvan bakımevi
  'evcil-hayvan':   'veteriner pet shop evcil hayvan köpek kedi kuaför bakım mama oyuncak hayvan bakımevi otelcilik aşı muayene',

  // Alt kategoriler: araç kiralama, oto galeri, taksi servis
  'ulasim':         'taksi araç kiralama otogar havalimanı ulaşım transfer servis minibüs oto galeri araba satış sürücü',
}

async function getEmbedding(text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: 'bge-m3', prompt: text })
    const req = http.request(
      { hostname: 'localhost', port: 11434, path: '/api/embeddings', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let data = ''
        res.on('data', c => data += c)
        res.on('end', () => {
          try { resolve(JSON.parse(data).embedding) }
          catch (e) { reject(new Error('Embedding parse hatası')) }
        })
      }
    )
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')) })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function main() {
  console.log()
  console.log(C.bold + C.cyan + '  Kategori Embedding Üretici' + C.reset)
  console.log(C.gray + '  ────────────────────────────────────' + C.reset)
  console.log()

  // Sadece ana kategorileri çek (parentId = null)
  const categories = await prisma.category.findMany({
    where: { parentId: null },
    select: { id: true, name: true, slug: true },
  })

  console.log(C.gray + `  ${categories.length} ana kategori bulundu:` + C.reset)
  categories.forEach(c => console.log(C.gray + `    · ${c.name} (${c.slug})` + C.reset))
  console.log()

  let ok = 0, skipped = 0, errors = 0

  for (const cat of categories) {
    const desc = CATEGORY_DESCRIPTIONS[cat.slug]

    if (!desc) {
      console.log(C.yellow + `  ~ ${cat.name} — açıklama tanımlı değil, atlandı` + C.reset)
      skipped++
      continue
    }

    try {
      process.stdout.write(C.gray + `  ⟳ ${cat.name.padEnd(25)} embedding üretiliyor...` + C.reset)

      const embedding = await getEmbedding(desc)
      const vectorStr = `[${embedding.join(',')}]`

      await prisma.$executeRawUnsafe(`
        INSERT INTO "CategoryEmbedding" (id, "categoryId", embedding, "createdAt")
        VALUES (gen_random_uuid()::text, $1, $2::vector(1024), now())
        ON CONFLICT ("categoryId") DO UPDATE SET embedding = EXCLUDED.embedding
      `, cat.id, vectorStr)

      process.stdout.write('\r' + C.green + `  ✓ ${cat.name.padEnd(25)} ` + C.gray + `(${embedding.length} dim)` + C.reset + '\n')
      ok++
    } catch (e) {
      process.stdout.write('\r' + C.red + `  ✗ ${cat.name.padEnd(25)} ${e.message.slice(0, 50)}` + C.reset + '\n')
      errors++
    }
  }

  console.log()
  console.log(C.gray + '  ────────────────────────────────────' + C.reset)
  console.log(C.green + `  ✓ Başarılı : ${ok}` + C.reset)
  if (skipped) console.log(C.yellow + `  ~ Atlandı  : ${skipped}` + C.reset)
  if (errors)  console.log(C.red    + `  ✗ Hatalı   : ${errors}` + C.reset)
  console.log()

  if (errors === 0 && ok > 0) {
    console.log(C.bold + C.cyan + '  ✅ Kategori embedding\'leri hazır!' + C.reset)
    console.log(C.gray + '  Sonraki adım: search_businesses fonksiyonunu güncelle' + C.reset)
  }

  console.log()
  await prisma.$disconnect()
}

main().catch(async e => {
  console.error(C.red + 'Kritik hata:' + C.reset, e)
  await prisma.$disconnect()
  process.exit(1)
})
