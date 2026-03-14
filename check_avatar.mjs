import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const u = await p.user.findFirst({where:{username:'poyraz'},select:{avatarUrl:true}})
console.log('avatarUrl:', u?.avatarUrl)
await p.$disconnect()
