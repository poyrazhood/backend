import p from './src/lib/prisma.js'
const res = await p['\$queryRawUnsafe']('SELECT indexname FROM pg_indexes WHERE tablename = \'BusinessEmbedding\'')
console.log(JSON.stringify(res))
await p['\$disconnect']()
