import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
await prisma.$connect()
await prisma.$executeRawUnsafe(`ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "subscriptionPlan" TEXT NOT NULL DEFAULT 'FREE'`)
await prisma.$executeRawUnsafe(`ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "subscriptionEndsAt" TIMESTAMP(3)`)
await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "BusinessSubscription" (
  "id"         TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "plan"       TEXT NOT NULL,
  "startsAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt"     TIMESTAMP(3) NOT NULL,
  "price"      FLOAT NOT NULL,
  "currency"   TEXT NOT NULL DEFAULT 'TRY',
  "status"     TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdBy"  TEXT,
  "notes"      TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BusinessSubscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BusinessSubscription_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE
)`)
await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BusinessSubscription_businessId_idx" ON "BusinessSubscription"("businessId")`)
await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BusinessSubscription_status_idx" ON "BusinessSubscription"("status")`)
console.log("Tablolar olusturuldu!")
await prisma.$disconnect()