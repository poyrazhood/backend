import p from './src/lib/prisma.js'
const count = await p.businessEmbedding.count()
console.log('Embedding:', count, '/ 432360 =', (count/432360*100).toFixed(1) + '%')
await p['\$disconnect']()
