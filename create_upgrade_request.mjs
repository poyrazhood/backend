import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
await prisma.$connect()
await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "UpgradeRequest" (
  "id"         TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "planWanted" TEXT NOT NULL,
  "phone"      TEXT,
  "note"       TEXT,
  "status"     TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UpgradeRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UpgradeRequest_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE
)`)
await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "UpgradeRequest_status_idx" ON "UpgradeRequest"("status")`)
await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "UpgradeRequest_businessId_idx" ON "UpgradeRequest"("businessId")`)
console.log("UpgradeRequest tablosu olusturuldu!")
await prisma.$disconnect()