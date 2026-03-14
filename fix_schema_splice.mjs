import { readFileSync, writeFileSync } from "fs"
const schema = readFileSync("C:/Users/PC/Desktop/tecrubelerim/prisma/schema.prisma", "utf8")
const lines = schema.split("\n")

// 125. satir (index 124) = verifiedAt
lines.splice(125, 0, `  verificationLevel      Int                    @default(0)`)
lines.splice(126, 0, `  verifiedPhone          String?`)
lines.splice(127, 0, `  verifiedEmail          String?`)

writeFileSync("C:/Users/PC/Desktop/tecrubelerim/prisma/schema.prisma", lines.join("\n"), "utf8")
console.log("Eklendi! Kontrol:")
for (let i = 123; i < 131; i++) console.log((i+1) + ": " + lines[i])