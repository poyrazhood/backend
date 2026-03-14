import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
await prisma.$connect()

await prisma.$executeRawUnsafe(`
  CREATE TABLE IF NOT EXISTS "VerificationRequest" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "businessId"  TEXT NOT NULL,
    "type"        TEXT NOT NULL,
    "code"        TEXT,
    "token"       TEXT,
    "phone"       TEXT,
    "email"       TEXT,
    "status"      TEXT NOT NULL DEFAULT 'pending',
    "attempts"    INT NOT NULL DEFAULT 0,
    "expiresAt"   TIMESTAMP,
    "documentUrl" TEXT,
    "adminNote"   TEXT,
    "createdAt"   TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt"   TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE
  )
`)
console.log("VerificationRequest tablosu olusturuldu!")

await prisma.$executeRawUnsafe(`
  ALTER TABLE "Business"
    ADD COLUMN IF NOT EXISTS "verificationLevel" INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "verifiedPhone" TEXT,
    ADD COLUMN IF NOT EXISTS "verifiedEmail" TEXT
`)
console.log("Business kolonlari eklendi!")

const enumValues = ['VERIFIED_GOOGLE', 'VERIFIED_EMAIL', 'VERIFIED_SMS', 'VERIFIED_ADDRESS', 'VERIFIED_PLATINUM']
for (const val of enumValues) {
  try {
    await prisma.$executeRawUnsafe(`ALTER TYPE "BadgeType" ADD VALUE IF NOT EXISTS '${val}'`)
    console.log("Enum eklendi:", val)
  } catch(e) {
    console.log("Zaten var veya hata:", val, e.message)
  }
}

console.log("Tamamlandi!")
await prisma.$disconnect()