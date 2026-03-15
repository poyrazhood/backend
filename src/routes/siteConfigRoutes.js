import prisma from '../lib/prisma.js'

async function siteConfigRoutes(fastify) {
  fastify.get('/:key', async (request, reply) => {
    const { key } = request.params
    const rows = await prisma.$queryRawUnsafe('SELECT "value" FROM "SiteConfig" WHERE "key" = $1', key)
    if (!rows[0]) return reply.code(404).send({ error: 'Bulunamadi.' })
    return reply.send({ key, value: rows[0].value })
  })
}

export default siteConfigRoutes