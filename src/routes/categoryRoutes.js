import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function categoryRoutes(fastify) {

  // GET /api/categories
  fastify.get('/', async (request, reply) => {
    try {
      const categories = await prisma.category.findMany({
        where: { parentId: null },
        include: {
          children: { select: { id: true, name: true, slug: true, icon: true, _count: { select: { businesses: true } } } },
          _count: { select: { businesses: true } },
        },
        orderBy: { name: 'asc' },
      });
      return reply.code(200).send({ data: categories });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Kategoriler alınamadı.' });
    }
  });

  // GET /api/categories/:slug
  fastify.get('/:slug', async (request, reply) => {
    try {
      const category = await prisma.category.findUnique({
        where: { slug: request.params.slug },
        include: {
          children: true,
          parent: true,
          _count: { select: { businesses: true } },
        },
      });
      if (!category) return reply.code(404).send({ error: 'Kategori bulunamadı.' });
      return reply.code(200).send(category);
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Kategori alınamadı.' });
    }
  });
}

export default categoryRoutes;
