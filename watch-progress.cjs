// watch-progress.cjs — Enrich Pipeline Canlı İzleme
//
// PipelineRun tablosundan okur (PipelineState güncellenmese bile çalışır)
// Tier dağılımı için Business tablosunu sorgular.
//
// Kullanım:
//   node watch-progress.cjs
//   node watch-progress.cjs --interval=5
//   node watch-progress.cjs --category=yeme-icme

'use strict'
require('dotenv').config({ path: require('path').join(__dirname, '.env') })
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// ── CLI args ──────────────────────────────────────────────────────────────────
const argv        = process.argv.slice(2)
const getArg      = (n) => { const i = argv.indexOf(`--${n}`); return i !== -1 ? argv[i+1] : null }
const intervalSec = parseInt(getArg('interval') || '3')
const categoryArg = getArg('category') || null

// ── Renkler ───────────────────────────────────────────────────────────────────
const C = {
  reset:'\x1b[0m', bold:'\x1b[1m', green:'\x1b[32m', red:'\x1b[31m',
  yellow:'\x1b[33m', cyan:'\x1b[36m', gray:'\x1b[90m', magenta:'\x1b[35m',
}

// ── Yardımcılar ───────────────────────────────────────────────────────────────
function bar(filled, total, width = 38) {
  const p = total > 0 ? Math.min(Math.round((filled / total) * width), width) : 0
  return C.green + '█'.repeat(p) + C.gray + '░'.repeat(width - p) + C.reset
}
function miniBar(filled, total, width = 12) {
  const p = total > 0 ? Math.min(Math.round((filled / total) * width), width) : 0
  return C.green + '█'.repeat(p) + C.gray + '░'.repeat(width - p) + C.reset
}
function pct(n, d)  { return d > 0 ? ((n / d) * 100).toFixed(1) : '0.0' }
function pad(s, w)  { return String(s).padStart(w) }
function lpad(s, w) { return String(s).padEnd(w) }
function num(n)     { return Number(n || 0).toLocaleString('tr-TR') }

function fmtETA(remainingSec) {
  if (!remainingSec || remainingSec <= 0) return '—'
  const s = Math.round(remainingSec)
  if (s < 60)   return `~${s}sn`
  if (s < 3600) return `~${Math.round(s / 60)}dk`
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  return `~${h}sa ${m}dk`
}

function fmtElapsed(startedAt) {
  if (!startedAt) return '—'
  const ms = Date.now() - new Date(startedAt).getTime()
  if (ms < 0) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60)   return `${s}sn`
  if (s < 3600) return `${Math.floor(s / 60)}dk ${s % 60}sn`
  return `${Math.floor(s / 3600)}sa ${Math.floor((s % 3600) / 60)}dk`
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ── Hız hesabı (PipelineRun'dan türetilir) ────────────────────────────────────
let prevProcessed = null
let prevTickTime  = null
let speedSamples  = []

function calcSpeed(currentProcessed) {
  const now = Date.now()
  if (prevProcessed !== null && prevTickTime !== null) {
    const delta = currentProcessed - prevProcessed
    const dtSec = (now - prevTickTime) / 1000
    if (dtSec > 0 && delta >= 0) {
      speedSamples.push(delta / dtSec)
      if (speedSamples.length > 8) speedSamples.shift()
    }
  }
  prevProcessed = currentProcessed
  prevTickTime  = now
  if (speedSamples.length === 0) return 0
  return speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length
}

// ── DB sorgusu ────────────────────────────────────────────────────────────────
async function fetchAll() {
  // Aktif RUNNING run'u al
  const runningRows = await prisma.$queryRawUnsafe(`
    SELECT * FROM "PipelineRun"
    WHERE pipeline = 'enrich' AND status = 'RUNNING'::"PipelineStatus"
    ORDER BY "startedAt" DESC LIMIT 1
  `)
  const run = runningRows[0] || null

  // Tier dağılımı — Business tablosundan
  const categoryJoin  = categoryArg
    ? `JOIN "Category" cat ON cat.id = b."categoryId" LEFT JOIN "Category" pcat ON pcat.id = cat."parentId"` : ''
  const categoryWhere = categoryArg
    ? `AND (cat.slug = '${categoryArg}' OR pcat.slug = '${categoryArg}')` : ''

  const tierRows = await prisma.$queryRawUnsafe(`
    SELECT
      COUNT(*) FILTER (WHERE b."totalReviews" >= 10)  AS t1_all,
      COUNT(*) FILTER (WHERE b."totalReviews" >= 3 AND b."totalReviews" < 10) AS t2_all,
      COUNT(*) FILTER (WHERE b."totalReviews" < 3)   AS t3_all,
      COUNT(*) FILTER (WHERE b."totalReviews" >= 10
        AND b.attributes::jsonb->'ai'->>'processedAt' IS NOT NULL) AS t1_done,
      COUNT(*) FILTER (WHERE b."totalReviews" >= 3 AND b."totalReviews" < 10
        AND b.attributes::jsonb->'ai'->>'processedAt' IS NOT NULL) AS t2_done,
      COUNT(*) FILTER (WHERE b."totalReviews" < 3
        AND b.attributes::jsonb->'ai'->>'processedAt' IS NOT NULL) AS t3_done
    FROM "Business" b
    ${categoryJoin}
    WHERE b."isActive" = true AND b."isDeleted" = false
    ${categoryWhere}
  `)
  const tiers = tierRows[0] || {}

  return { run, tiers }
}

// ── Ekran çizimi ──────────────────────────────────────────────────────────────
function render({ run, tiers, speed }) {
  const isRunning  = !!run
  const processed  = Number(run?.processed  || 0)
  const remaining  = Number(run?.remaining  || 0)
  const errors     = Number(run?.errors     || 0)
  const total      = processed + remaining
  const startedAt  = run?.startedAt || null
  const message    = run?.message   || ''

  const t1a = Number(tiers.t1_all  || 0), t1d = Number(tiers.t1_done || 0)
  const t2a = Number(tiers.t2_all  || 0), t2d = Number(tiers.t2_done || 0)
  const t3a = Number(tiers.t3_all  || 0), t3d = Number(tiers.t3_done || 0)
  const tierTotal = t1a + t2a + t3a
  const tierDone  = t1d + t2d + t3d

  const etaSec = speed > 0 && remaining > 0 ? remaining / speed : 0

  const lines = []
  lines.push('')
  lines.push(C.bold + C.cyan + '  ╔══════════════════════════════════════════════════════╗' + C.reset)
  lines.push(C.bold + C.cyan + '  ║   tecrubelerim.com — Enrich Pipeline İzleme          ║' + C.reset)
  lines.push(C.bold + C.cyan + '  ╚══════════════════════════════════════════════════════╝' + C.reset)
  lines.push('')

  if (isRunning) {
    lines.push(
      `  ⏳ Durum   : ${C.yellow}${C.bold}RUNNING${C.reset}` +
      (message ? C.gray + `  —  ${message.slice(0, 50)}` + C.reset : '')
    )
    lines.push(
      `  Başlangıç : ${C.gray}${fmtDate(startedAt)}${C.reset}` +
      `   Çalışma: ${C.cyan}${C.bold}${fmtElapsed(startedAt)}${C.reset}`
    )
  } else {
    lines.push(C.gray + `  ⏸  Aktif pipeline yok. Pipeline başlatıldığında otomatik gösterilir.` + C.reset)
  }
  lines.push('')

  // Genel progress — mevcut run'dan
  lines.push(C.bold + `  Bu Run İlerlemesi` + C.gray + `  (${num(total)} işletme bu run'da)` + C.reset)
  lines.push(`  ${bar(processed, total)}  ${C.bold}${pct(processed, total)}%${C.reset}`)
  lines.push(
    `  ${C.green}Tamamlanan : ${C.bold}${num(processed)}${C.reset}` +
    C.gray + `  /  ${num(total)}` + C.reset
  )
  lines.push(
    `  ${C.yellow}Kalan      : ${C.bold}${num(remaining)}${C.reset}` +
    (errors > 0 ? `   ${C.red}Hata: ${num(errors)}${C.reset}` : '')
  )
  lines.push('')

  // Tier tablosu — tüm DB
  lines.push(C.bold + `  Toplam DB Durumu` + C.gray + `  (tüm işletmeler — ${num(tierTotal)} kayıt)` + C.reset)
  lines.push(C.gray + `  ┌──────────────────────────────────────────────────────┐` + C.reset)
  lines.push(
    C.gray + `  │ ` + C.reset +
    lpad('Tier', 22) + pad('Bitti', 8) + C.gray + pad('Toplam', 9) + C.reset +
    pad('Oran', 7) + `  Bar          ` +
    C.gray + `│` + C.reset
  )
  lines.push(C.gray + `  ├──────────────────────────────────────────────────────┤` + C.reset)

  const rows = [
    { label: 'Tier 1  (≥10 yorum)', d: t1d, a: t1a, color: C.green },
    { label: 'Tier 2  (3–9 yorum)', d: t2d, a: t2a, color: C.yellow },
    { label: 'Tier 3  (0–2 yorum)', d: t3d, a: t3a, color: C.gray },
  ]
  for (const r of rows) {
    lines.push(
      `  │ ${r.color}${lpad(r.label, 22)}${C.reset}` +
      `${pad(num(r.d), 8)}` +
      `${C.gray}${pad(num(r.a), 9)}${C.reset}` +
      `${pad(pct(r.d, r.a) + '%', 7)}  ${miniBar(r.d, r.a)}  │`
    )
  }
  lines.push(C.gray + `  ├──────────────────────────────────────────────────────┤` + C.reset)
  lines.push(
    `  │ ${C.bold}${lpad('TOPLAM', 22)}${C.reset}` +
    `${pad(num(tierDone), 8)}` +
    `${C.gray}${pad(num(tierTotal), 9)}${C.reset}` +
    `${pad(pct(tierDone, tierTotal) + '%', 7)}  ${miniBar(tierDone, tierTotal)}  │`
  )
  lines.push(C.gray + `  └──────────────────────────────────────────────────────┘` + C.reset)
  lines.push('')

  // Hız & ETA
  if (isRunning) {
    lines.push(C.bold + `  Performans` + C.reset)
    lines.push(
      `  Hız  : ${C.cyan}${C.bold}${speed > 0 ? (speed * 60).toFixed(1) + ' işletme/dk' : 'hesaplanıyor...'}${C.reset}`
    )
    lines.push(`  ETA  : ${C.magenta}${C.bold}${fmtETA(etaSec)}${C.reset}`)
    lines.push('')
  }

  lines.push(
    C.gray +
    `  Son güncelleme: ${new Date().toLocaleTimeString('tr-TR')}` +
    `   her ${intervalSec}sn yenilenir   Ctrl+C ile çık` +
    C.reset
  )
  lines.push('')

  process.stdout.write('\x1b[2J\x1b[H')
  process.stdout.write(lines.join('\n') + '\n')
}

// ── Ana döngü ─────────────────────────────────────────────────────────────────
async function tick() {
  try {
    const { run, tiers } = await fetchAll()
    const speed = calcSpeed(Number(run?.processed || 0))
    render({ run, tiers, speed })

    // Otomatik kapanma: run SUCCESS olunca
    if (run?.status === 'SUCCESS') {
      console.log(C.green + C.bold + `  ✅ Pipeline tamamlandı — İzleme durduruluyor.` + C.reset + '\n')
      await prisma.$disconnect()
      process.exit(0)
    }
  } catch (e) {
    process.stdout.write('\x1b[2J\x1b[H')
    console.error(C.red + '\n  DB bağlantı hatası:' + C.reset, e.message)
    console.log(C.gray + '  Yeniden denenecek...\n' + C.reset)
  }
}

;(async () => {
  process.stdout.write('\x1b[2J\x1b[H')
  console.log(C.cyan + '\n  Bağlanılıyor...' + C.reset)
  await tick()
  const iv = setInterval(tick, intervalSec * 1000)
  process.on('SIGINT', async () => {
    clearInterval(iv)
    await prisma.$disconnect()
    console.log('\n' + C.gray + '  İzleme durduruldu.' + C.reset + '\n')
    process.exit(0)
  })
})()
