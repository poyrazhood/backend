import { readFileSync, writeFileSync } from "fs"
let schema = readFileSync("C:/Users/PC/Desktop/tecrubelerim/prisma/schema.prisma", "utf8")

schema = schema.replace(
  `enum BusinessBadgeType {
  VERIFIED
  NEIGHBORHOOD_FAVORITE
  FEATURED
  PREMIUM
  TOP_RATED
  HIGHLY_REVIEWED
  NEW_BUSINESS
  TRUSTED
}`,
  `enum BusinessBadgeType {
  VERIFIED
  NEIGHBORHOOD_FAVORITE
  FEATURED
  PREMIUM
  TOP_RATED
  HIGHLY_REVIEWED
  NEW_BUSINESS
  TRUSTED
  VERIFIED_GOOGLE
  VERIFIED_EMAIL
  VERIFIED_SMS
  VERIFIED_ADDRESS
  VERIFIED_PLATINUM
}`
)

writeFileSync("C:/Users/PC/Desktop/tecrubelerim/prisma/schema.prisma", schema, "utf8")
console.log("Enum guncellendi!")
console.log("VERIFIED_SMS var mi:", schema.includes("VERIFIED_SMS"))