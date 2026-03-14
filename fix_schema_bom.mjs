import { readFileSync, writeFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim/prisma/schema.prisma", "utf8")
const fixed = content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content
writeFileSync("C:/Users/PC/Desktop/tecrubelerim/prisma/schema.prisma", fixed, "utf8")
console.log("BOM kaldirildi!")