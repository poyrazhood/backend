import { readFileSync, writeFileSync } from "fs"
let schema = readFileSync("C:/Users/PC/Desktop/tecrubelerim/prisma/schema.prisma", "utf8")

schema = schema.replace(
  "  reviews               Review[]",
  "  reviews               Review[]\n  autoServiceProfile    AutoServiceProfile?"
)

const count = (schema.match(/autoServiceProfile/g) || []).length
console.log("autoServiceProfile sayisi:", count)
writeFileSync("C:/Users/PC/Desktop/tecrubelerim/prisma/schema.prisma", schema, "utf8")
console.log("Kaydedildi!")