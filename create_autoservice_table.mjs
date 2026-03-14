import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
await prisma.$connect()
await prisma.$executeRawUnsafe(`
  CREATE TABLE IF NOT EXISTS "AutoServiceProfile" (
    "id"                     TEXT NOT NULL PRIMARY KEY,
    "businessId"             TEXT NOT NULL UNIQUE,
    "scoreTecrube"           FLOAT NOT NULL DEFAULT 0,
    "scoreFiyatSeffafligi"   FLOAT NOT NULL DEFAULT 0,
    "scoreTeknikYetkinlik"   FLOAT NOT NULL DEFAULT 0,
    "scoreMusteriIliskileri" FLOAT NOT NULL DEFAULT 0,
    "scoreEkipman"           FLOAT NOT NULL DEFAULT 0,
    "scoreGaranti"           FLOAT NOT NULL DEFAULT 0,
    "ustaSicili"             INT,
    "liftSayisi"             INT,
    "garantiSuresiAy"        INT,
    "sertifikalar"           TEXT[] NOT NULL DEFAULT '{}',
    "uzmanlikAlanlari"       TEXT[] NOT NULL DEFAULT '{}',
    "totalRatings"           INT NOT NULL DEFAULT 0,
    "lastCalculatedAt"       TIMESTAMP,
    "createdAt"              TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt"              TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE
  )
`)
console.log("AutoServiceProfile tablosu olusturuldu!")
await prisma.$disconnect()