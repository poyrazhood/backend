import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
await prisma.$connect()

await prisma.$executeRawUnsafe(`
  INSERT INTO "AutoServiceProfile" ("id", "businessId", "scoreTecrube", "scoreEkipman", "ustaSicili", "liftSayisi", "garantiSuresiAy", "sertifikalar", "uzmanlikAlanlari", "updatedAt")
  VALUES (gen_random_uuid()::text, 'cmm1d3zys00etasrtwj8yhf4v', 80, 72, 8, 2, 3, ARRAY['Bosch Servis'], ARRAY['Motor','Fren','Elektrik'], NOW())
  ON CONFLICT ("businessId") DO UPDATE SET
    "scoreTecrube" = 80, "scoreEkipman" = 72, "ustaSicili" = 8,
    "liftSayisi" = 2, "garantiSuresiAy" = 3,
    "sertifikalar" = ARRAY['Bosch Servis'],
    "uzmanlikAlanlari" = ARRAY['Motor','Fren','Elektrik'],
    "updatedAt" = NOW()
`)

console.log("Profil eklendi!")
await prisma.$disconnect()