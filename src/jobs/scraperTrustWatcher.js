// src/jobs/scraperTrustWatcher.js
// Scraper yorum ekledikçe o işletmelerin Güven Skorunu günceller
// Her 30 dakikada bir çalışır — scraper.js'e dokunmadan

import { PrismaClient } from '@prisma/client'
import { calculateBusinessTrust } from '../services/businessTrustService.js'

const prisma = new PrismaClient()
const INTERVAL_MS  = 30 * 60 * 1000  // 30 dakika
const LOOKBACK_MIN = 35               // Son 35 dakikada güncellenen işletmeler

function log(msg) {
  const t = new Date().toISOString().replace('T',' ').slice(0,19)
  console.log(`[TrustWatcher ${t}] ${msg}`)
}

async function watchCycle() {
  const since = new Date(Date.now() - LOOKBACK_MIN * 60 * 1000)

  // Son 35 dakikada externalReview eklenen/güncellenen işletmeleri bul
  const updated = await prisma.externalReview.findMany({
    where:   { updatedAt: { gte: since } },
    select:  { businessId: true },
    distinct: ['businessId'],
  })

  if (updated.length === 0) {
    log('Yeni scrape yok, bekleniyor...')
    return
  }

  log(`${updated.length} işletme yeniden hesaplanacak...`)

  let success = 0
  let errors  = 0

  // 5'er paralel işle — sunucuyu yormamak için az tutuyoruz
  const BATCH = 5
  for (let i = 0; i < updated.length; i += BATCH) {
    const batch = updated.slice(i, i + BATCH)
    await Promise.allSettled(batch.map(async ({ businessId }) => {
      try {
        await calculateBusinessTrust(businessId)
        success++
      } catch {
        errors++
      }
    }))
  }

  log(`Tamamlandı: ${success} güncellendi, ${errors} hata`)
}

async function start() {
  log('Scraper Trust Watcher başladı')
  log(`Her ${INTERVAL_MS / 60000} dakikada bir çalışacak`)

  // İlk çalışma
  await watchCycle().catch(e => log(`HATA: ${e.message}`))

  // Periyodik çalışma
  setInterval(async () => {
    await watchCycle().catch(e => log(`HATA: ${e.message}`))
  }, INTERVAL_MS)
}

start()
