import { readFileSync, writeFileSync } from "fs"
let content = readFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/verificationRoutes.js", "utf8")

content = content.replace(
  `SELECT type, "awardedAt" FROM "BusinessBadge" WHERE "businessId" = $1 AND type LIKE 'VERIFIED_%'`,
  `SELECT type::text, "awardedAt" FROM "BusinessBadge" WHERE "businessId" = $1 AND type::text LIKE 'VERIFIED_%'`
)

writeFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/verificationRoutes.js", content, "utf8")
console.log("Duzeltildi!")