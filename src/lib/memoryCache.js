// lib/memoryCache.js
// Redis gerektirmeyen in-process cache — Fastify restart'ta temizlenir
// 432k işletme için feed cache'i yönetir

const store = new Map()

/**
 * Cache key üret
 */
export function buildCacheKey(prefix, params) {
  const sorted = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join('|')
  return `${prefix}:${sorted}`
}

/**
 * Cache'den oku — süresi dolmuşsa null döner ve siler
 */
export function getCache(key) {
  const entry = store.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    store.delete(key)
    return null
  }
  return entry.data
}

/**
 * Cache'e yaz
 * @param {string} key
 * @param {any} data
 * @param {number} ttlSeconds — varsayılan 60sn
 */
export function setCache(key, data, ttlSeconds = 60) {
  // Bellek taşmasını önle — 500 entry limitini aş geçince en eskiyi sil
  if (store.size >= 500) {
    const firstKey = store.keys().next().value
    store.delete(firstKey)
  }
  store.set(key, {
    data,
    expiresAt: Date.now() + ttlSeconds * 1000,
  })
}

/**
 * Pattern ile cache temizle
 * Örn: invalidateCache('feed:') → feed ile başlayan tüm keyler silinir
 */
export function invalidateCache(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key)
  }
}

/**
 * Cache istatistikleri — debug için
 */
export function getCacheStats() {
  return { size: store.size, keys: [...store.keys()] }
}
