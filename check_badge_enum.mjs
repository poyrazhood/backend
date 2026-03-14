import { readFileSync } from "fs"
const schema = readFileSync("C:/Users/PC/Desktop/tecrubelerim/prisma/schema.prisma", "utf8")
const idx = schema.indexOf("enum BadgeType")
if (idx > -1) console.log(schema.substring(idx, idx + 200))
else {
  // Farkli isimde olabilir
  const idx2 = schema.indexOf("BusinessBadgeType")
  if (idx2 > -1) console.log(schema.substring(idx2, idx2 + 200))
  else console.log("Badge enum bulunamadi!")
}