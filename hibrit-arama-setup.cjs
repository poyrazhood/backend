// hibrit-arama-setup.cjs
// hibrit-arama-setup.sql dosyasını veritabanına uygular
//
// Kullanım:
//   node hibrit-arama-setup.cjs

const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')

const prisma = new PrismaClient()

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', red: '\x1b[31m',
  cyan: '\x1b[36m',  gray: '\x1b[90m',
}

async function main() {
  console.log()
  console.log(C.bold + C.cyan + '  Hibrit Arama — DB Kurulumu' + C.reset)
  console.log(C.gray + '  ────────────────────────────────────' + C.reset)
  console.log()

  const sqlPath = path.join(__dirname, 'hibrit-arama-setup.sql')
  if (!fs.existsSync(sqlPath)) {
    console.error(C.red + '  HATA: hibrit-arama-setup.sql bulunamadı.' + C.reset)
    console.error(C.gray + '  Dosyanın aynı klasörde olduğundan emin ol.' + C.reset)
    process.exit(1)
  }

  const raw = fs.readFileSync(sqlPath, 'utf8')

  // Yorum satırlarını temizle, statement'lara böl
  const statements = raw
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'))

  let ok = 0, skipped = 0, errors = 0

  for (const stmt of statements) {
    // Sadece yorum satırı olan blokları atla
    const lines = stmt.split('\n').filter(l => !l.trim().startsWith('--'))
    const cleaned = lines.join('\n').trim()
    if (!cleaned) { skipped++; continue }

    const preview = cleaned.replace(/\s+/g, ' ').slice(0, 70)

    try {
      await prisma.$executeRawUnsafe(cleaned)
      console.log(C.green + '  ✓ ' + C.reset + C.gray + preview + C.reset)
      ok++
    } catch (e) {
      // "already exists" hataları normal — indeks veya fonksiyon zaten varsa
      if (e.message && (
        e.message.includes('already exists') ||
        e.message.includes('zaten var')
      )) {
        console.log(C.gray + '  ~ (zaten var, atlandı): ' + preview + C.reset)
        skipped++
      } else {
        console.log(C.red + '  ✗ HATA: ' + e.message.slice(0, 100) + C.reset)
        console.log(C.gray + '    SQL: ' + preview + C.reset)
        errors++
      }
    }
  }

  console.log()
  console.log(C.gray + '  ────────────────────────────────────' + C.reset)
  console.log(C.green + `  ✓ Başarılı : ${ok}` + C.reset)
  if (skipped) console.log(C.gray + `  ~ Atlandı  : ${skipped}` + C.reset)
  if (errors)  console.log(C.red   + `  ✗ Hatalı   : ${errors}` + C.reset)
  console.log()

  if (errors === 0) {
    console.log(C.bold + C.cyan + '  ✅ Kurulum tamamlandı!' + C.reset)
    console.log(C.gray + '  Test için: node test-search.cjs "kadıköy restoran"' + C.reset)
  } else {
    console.log(C.red + '  ⚠ Bazı adımlar başarısız. Hataları incele.' + C.reset)
  }

  console.log()
  await prisma.$disconnect()
}

main().catch(async e => {
  console.error(C.red + 'Kritik hata:' + C.reset, e)
  await prisma.$disconnect()
  process.exit(1)
})
