// ─── Image Proxy Route ────────────────────────────────────────────────────────
// Google CDN ve diğer kaynaklardan fotoğraf proxy'ler
// Kullanım: /api/image-proxy?url=https://lh3.googleusercontent.com/...

async function imageProxyRoutes(fastify) {
  fastify.get('/image-proxy', async (request, reply) => {
    const { url } = request.query
    if (!url) return reply.code(400).send({ error: 'url parametresi gerekli' })

    // Sadece izin verilen domainler
    const ALLOWED = [
      'lh3.googleusercontent.com',
      'lh4.googleusercontent.com',
      'lh5.googleusercontent.com',
      'lh6.googleusercontent.com',
      'maps.googleapis.com',
      'streetviewpixels-pa.googleapis.com',
    ]

    let parsedUrl
    try { parsedUrl = new URL(url) } 
    catch { return reply.code(400).send({ error: 'Geçersiz URL' }) }

    if (!ALLOWED.some(d => parsedUrl.hostname === d)) {
      return reply.code(403).send({ error: 'İzin verilmeyen domain' })
    }

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.google.com/',
          'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(8000),
      })

      if (!res.ok) return reply.code(502).send({ error: 'Upstream hata: ' + res.status })

      const contentType = res.headers.get('content-type') || 'image/jpeg'
      const buffer = Buffer.from(await res.arrayBuffer())

      reply
        .header('Content-Type', contentType)
        .header('Cache-Control', 'public, max-age=86400') // 1 gün cache
        .header('Access-Control-Allow-Origin', '*')
        .send(buffer)
    } catch (err) {
      fastify.log.error('Image proxy hata:', err.message)
      return reply.code(502).send({ error: 'Fotoğraf alınamadı' })
    }
  })
}

export default imageProxyRoutes
