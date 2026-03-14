import { readFileSync, writeFileSync } from "fs"
let schema = readFileSync("C:/Users/PC/Desktop/tecrubelerim/prisma/schema.prisma", "utf8")

schema = schema.replace(
  `  verifiedAt             DateTime?`,
  `  verifiedAt             DateTime?
  verificationLevel      Int                    @default(0)
  verifiedPhone          String?
  verifiedEmail          String?`
)

writeFileSync("C:/Users/PC/Desktop/tecrubelerim/prisma/schema.prisma", schema, "utf8")
console.log("verificationLevel var mi:", schema.includes("verificationLevel"))