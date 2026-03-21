import p from './src/lib/prisma.js'
const res = await p.business.findFirst({where:{slug:'citys-istanbul'},select:{attributes:true}})
console.log(JSON.stringify(res?.attributes))
await p['\$disconnect']()
