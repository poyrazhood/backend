import p from './src/lib/prisma.js'
console.log('Index olusturuluyor, bekleniyor...')
await p['\$queryRawUnsafe']('CREATE INDEX IF NOT EXISTS business_embedding_hnsw_idx ON "BusinessEmbedding" USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)')
console.log('Tamamlandi!')
await p['\$disconnect']()
