import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const users = await p.user.findMany({ where: { avatarUrl: { startsWith: '/api/upload' } }, select: { id: true, avatarUrl: true } })
for (const u of users) {
  const newUrl = 'http://localhost:3001' + u.avatarUrl
  await p.user.update({ where: { id: u.id }, data: { avatarUrl: newUrl } })
  console.log('Updated:', newUrl)
}
await p.$disconnect()
console.log('Done:', users.length, 'users')