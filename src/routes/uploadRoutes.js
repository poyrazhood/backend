import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { pipeline } from 'stream/promises'
import crypto from 'crypto'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPLOAD_DIR = path.join(__dirname, '../../uploads')

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

async function uploadRoutes(fastify) {
  // GET /api/upload/avatars/:filename
  fastify.get('/avatars/:filename', async (request, reply) => {
    const { filename } = request.params
    const filePath = path.join(UPLOAD_DIR, 'avatars', filename)
    if (!fs.existsSync(filePath)) return reply.code(404).send({ error: 'Dosya bulunamadi.' })
    return reply.sendFile('avatars/' + filename, UPLOAD_DIR)
  })

  fastify.get('/reviews/:filename', async (request, reply) => {
    const { filename } = request.params
    const filePath = path.join(UPLOAD_DIR, 'reviews', filename)
    if (!fs.existsSync(filePath)) return reply.code(404).send({ error: 'Dosya bulunamadi.' })
    return reply.sendFile('reviews/' + filename, UPLOAD_DIR)
  })

  fastify.get('/businesses/:filename', async (request, reply) => {
    const { filename } = request.params
    const filePath = path.join(UPLOAD_DIR, 'businesses', filename)
    if (!fs.existsSync(filePath)) return reply.code(404).send({ error: 'Dosya bulunamadi.' })
    return reply.sendFile('businesses/' + filename, UPLOAD_DIR)
  })

  // POST /api/upload/avatar
  fastify.post('/avatar', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const data = await request.file()
      if (!data) return reply.code(400).send({ error: 'Dosya bulunamadi.' })
      if (!ALLOWED_TYPES.includes(data.mimetype)) return reply.code(400).send({ error: 'Sadece JPG, PNG, WebP ve GIF desteklenir.' })

      // Dosyayı buffer'a al (max 5MB)
      const chunks = []
      let size = 0
      for await (const chunk of data.file) {
        size += chunk.length
        if (size > MAX_SIZE) return reply.code(400).send({ error: 'Dosya 5MB limitini asiyor.' })
        chunks.push(chunk)
      }
      const buffer = Buffer.concat(chunks)

      // Sharp ile sıkıştır: 400x400 kare, WebP, kalite 80
      const filename = `${request.user.userId}-${crypto.randomBytes(6).toString('hex')}.webp`
      const filePath = path.join(UPLOAD_DIR, 'avatars', filename)
      await sharp(buffer)
        .resize(400, 400, { fit: 'cover', position: 'center' })
        .webp({ quality: 80 })
        .toFile(filePath)

      const url = `http://localhost:3001/api/upload/avatars/${filename}`
      const { PrismaClient } = await import('@prisma/client')
      const prisma = new PrismaClient()
      await prisma.user.update({ where: { id: request.user.userId }, data: { avatarUrl: url } })
      await prisma.$disconnect()

      return reply.code(200).send({ url })
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: 'Upload basarisiz.' })
    }
  })

  // POST /api/upload/review
  fastify.post('/review', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const data = await request.file()
      if (!data) return reply.code(400).send({ error: 'Dosya bulunamadi.' })
      if (!ALLOWED_TYPES.includes(data.mimetype)) return reply.code(400).send({ error: 'Sadece JPG, PNG, WebP ve GIF desteklenir.' })

      const ext = path.extname(data.filename) || '.jpg'
      const filename = `${request.user.userId}-${crypto.randomBytes(6).toString('hex')}${ext}`
      const filePath = path.join(UPLOAD_DIR, 'reviews', filename)

      let size = 0
      data.file.on('data', chunk => { size += chunk.length })
      await pipeline(data.file, fs.createWriteStream(filePath))

      if (size > MAX_SIZE) {
        fs.unlinkSync(filePath)
        return reply.code(400).send({ error: 'Dosya 5MB limitini asiyor.' })
      }

      const url = `/api/upload/reviews/${filename}`
      return reply.code(200).send({ url })
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: 'Upload basarisiz.' })
    }
  })
}

export default uploadRoutes