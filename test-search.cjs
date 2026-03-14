// test-search.cjs
// Hibrit aramayı direkt DB üzerinde test eder (Next.js gerekmez)
//
// Kullanım:
//   node test-search.cjs "kadıköy restoran"
//   node test-search.cjs "istanbul otel" --city İstanbul
//   node test-search.cjs "güzellik salonu" --category guzellik-bakim

const http = require('http')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', cyan: '\x1b[36m',
  gray: '\x1b[90m',  yellow: '\x1b[33m',
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
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function main() {
  const args = process.argv.slice(2)
  const query    = args[0]
  const city     = args.includes('--city')     ? args[args.indexOf('--city') + 1]     : null
  const category = args.includes('--category') ? args[args.indexOf('--category') + 1] : null
  const limit    = args.includes('--limit')    ? parseInt(args[args.indexOf('--limit') + 1]) : 10

  if (!query) {
    console.log('Kullanım: node test-search.cjs "arama terimi" [--city şehir] [--category slug] [--limit N]')
    process.exit(1)
  }

  console.log()
  console.log(C.bold + C.cyan + '  Hibrit Arama Testi' + C.reset)
  console.log(C.gray + '  ─────────────────────────────────────────' + C.reset)
  console.log(C.gray + `  Sorgu    : ` + C.bold + query + C.reset)
  if (city)     console.log(C.gray + `  Şehir    : ${city}` + C.reset)
  if (category) console.log(C.gray + `  Kategori : ${category}` + C.reset)
  console.log()

  // Embedding üret
  process.stdout.write(C.gray + '  Embedding üretiliyor...' + C.reset)
  const t1 = Date.now()
  const embedding = await getEmbedding(query)
  const vectorStr = `[${embedding.join(',')}]`
  const embedMs = Date.now() - t1
  process.stdout.write('\r' + C.green + `  ✓ Embedding hazır (1024 dim) ` + C.gray + `${embedMs}ms` + C.reset + '\n')

  // Hibrit arama — tüm parametreler explicit cast ile
  const t2 = Date.now()
  const results = await prisma.$queryRawUnsafe(`
    SELECT
      name, slug, city, district, category_name,
      average_rating, total_reviews,
      vec_score, trgm_score, category_boost, final_score
    FROM search_businesses(
      $1::text,
      $2::vector(1024),
      $3::text,
      $4::text,
      $5::int,
      0.6::float,
      0.4::float
    )
  `, query, vectorStr, city, category, limit)

  const dbMs = Date.now() - t2
  console.log(C.gray + `  DB sorgusu: ${dbMs}ms  |  Toplam: ${embedMs + dbMs}ms` + C.reset)
  console.log()

  if (results.length === 0) {
    console.log(C.gray + '  Sonuç bulunamadı.' + C.reset)
  } else {
    console.log(C.bold + `  ${results.length} sonuç:` + C.reset)
    console.log(C.gray + '  ─────────────────────────────────────────────────────────────' + C.reset)
    results.forEach((r, i) => {
      const rating = r.average_rating > 0 ? `⭐ ${Number(r.average_rating).toFixed(1)}` : '  —  '
      const loc    = r.district ? `${r.city} / ${r.district}` : r.city
      console.log(
        C.bold + `  ${String(i+1).padStart(2)}. ${r.name.slice(0, 35).padEnd(36)}` + C.reset +
        C.gray  + loc.slice(0, 18).padEnd(19) + C.reset +
        C.yellow + rating.padEnd(10) + C.reset +
        C.cyan  + `final:${Number(r.final_score).toFixed(3)}` + C.reset +
        C.gray  + ` (v:${Number(r.vec_score).toFixed(3)} t:${Number(r.trgm_score).toFixed(3)} boost:${Number(r.category_boost).toFixed(1)})` + C.reset
      )
      console.log(C.gray + `       ${r.category_name}` + C.reset)
    })
    console.log()
    console.log(C.gray + '  v = vektör skoru  t = trgm skoru  final = 0.6v + 0.4t' + C.reset)
  }

  console.log()
  await prisma.$disconnect()
}

main().catch(async e => {
  console.error('Hata:', e.message)
  await prisma.$disconnect()
  process.exit(1)
})
