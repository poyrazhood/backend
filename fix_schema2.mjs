import { readFileSync, writeFileSync } from "fs"
let schema = readFileSync("C:/Users/PC/Desktop/tecrubelerim/prisma/schema.prisma", "utf8")
const lines = schema.split("\n")
// 241. satir (index 240) duplicate ownerReplyDate - sil
lines.splice(240, 1)
writeFileSync("C:/Users/PC/Desktop/tecrubelerim/prisma/schema.prisma", lines.join("\n"), "utf8")
console.log("Duzeltildi!")