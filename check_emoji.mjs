import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
await prisma.$connect()
const businesses = await prisma.business.findMany({ 
  where: { city: "Adana" },
  select: { name: true, attributes: true },
  take: 20
})
const b = businesses.find(x => {
  const tags = x?.attributes?.about?.["Özellikler"]
  return tags && tags.length > 0
})
if (b) {
  console.log("Isletme:", b.name)
  const tags = b.attributes.about["Özellikler"]
  tags.forEach(t => {
    const codes = [...t].map(c => c.codePointAt(0).toString(16)).join(" ")
    console.log(JSON.stringify(t), "->", codes)
  })
} else { console.log("Ozellik bulunamadi") }
await prisma.$disconnect()