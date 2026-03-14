import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
await prisma.$connect()

// Poyraz'in userId'sini bul
const user = await prisma.user.findFirst({ where: { email: "poyrazhood@gmail.com" }, select: { id: true } })
console.log("Poyraz userId:", user.id)

// Oto servis isletmesini poyraz'a ata
await prisma.business.update({
  where: { id: "cmm1d3zys00etasrtwj8yhf4v" },
  data: { ownerId: user.id, claimStatus: "CLAIMED" }
})
console.log("Kadikoy Oto Tamircisi 7/24 poyraz'a atandi!")

await prisma.$disconnect()