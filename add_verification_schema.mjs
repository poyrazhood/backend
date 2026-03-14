import { readFileSync, writeFileSync } from "fs"
let schema = readFileSync("C:/Users/PC/Desktop/tecrubelerim/prisma/schema.prisma", "utf8")

// BadgeType enum'una yeni tipler ekle
schema = schema.replace(
  `enum BadgeType {
  NEIGHBORHOOD_FAVORITE
  TOP_RATED
  HIGHLY_REVIEWED
  NEW_BUSINESS`,
  `enum BadgeType {
  NEIGHBORHOOD_FAVORITE
  TOP_RATED
  HIGHLY_REVIEWED
  NEW_BUSINESS
  VERIFIED_GOOGLE
  VERIFIED_EMAIL
  VERIFIED_SMS
  VERIFIED_ADDRESS
  VERIFIED_PLATINUM`
)

// Business modeline verificationLevel ekle
schema = schema.replace(
  `  verifiedAt             DateTime?`,
  `  verifiedAt             DateTime?
  verificationLevel      Int                    @default(0)
  verifiedPhone          String?
  verifiedEmail          String?`
)

// VerificationRequest modeli ekle
const model = `
model VerificationRequest {
  id           String   @id @default(cuid())
  businessId   String
  business     Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  type         String   // sms, email, address
  code         String?  // OTP kodu
  token        String?  // email token
  phone        String?
  email        String?
  status       String   @default("pending") // pending, verified, expired, rejected
  attempts     Int      @default(0)
  expiresAt    DateTime?
  documentUrl  String?  // adres belgesi
  adminNote    String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
`

// Business modeline relation ekle
schema = schema.replace(
  `  autoServiceProfile    AutoServiceProfile?`,
  `  autoServiceProfile    AutoServiceProfile?
  verificationRequests  VerificationRequest[]`
)

schema = schema + model
writeFileSync("C:/Users/PC/Desktop/tecrubelerim/prisma/schema.prisma", schema, "utf8")
console.log("Schema guncellendi!")