import { readFileSync, writeFileSync } from "fs"
let schema = readFileSync("C:/Users/PC/Desktop/tecrubelerim/prisma/schema.prisma", "utf8")

const model = `
model AutoServiceProfile {
  id                    String   @id @default(cuid())
  businessId            String   @unique
  business              Business @relation(fields: [businessId], references: [id], onDelete: Cascade)

  // Radar skorlari (0-100)
  scoreTecrube          Float    @default(0)
  scoreFiyatSeffafligi  Float    @default(0)
  scoreTeknikYetkinlik  Float    @default(0)
  scoreMusteriIliskileri Float   @default(0)
  scoreEkipman          Float    @default(0)
  scoreGaranti          Float    @default(0)

  // Sahip tarafindan girilen bilgiler
  ustaSicili            Int?     // Kac yillik
  liftSayisi            Int?
  garantiSuresiAy       Int?
  sertifikalar          String[]
  uzmanlikAlanlari      String[]

  // Otomatik hesaplama meta
  totalRatings          Int      @default(0)
  lastCalculatedAt      DateTime?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
}
`

// Business modeline iliski ekle
schema = schema.replace(
  "  reviews               Review[]",
  `  reviews               Review[]
  autoServiceProfile    AutoServiceProfile?`
)

schema = schema + model
writeFileSync("C:/Users/PC/Desktop/tecrubelerim/prisma/schema.prisma", schema, "utf8")
console.log("AutoServiceProfile eklendi!")