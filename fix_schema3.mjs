import { readFileSync, writeFileSync } from "fs"
let schema = readFileSync("C:/Users/PC/Desktop/tecrubelerim/prisma/schema.prisma", "utf8")
const lines = schema.split("\n")
// index 240 = "  updatedAt" satirindan once createdAt ekle
lines.splice(240, 0, "  createdAt              DateTime      @default(now())")
writeFileSync("C:/Users/PC/Desktop/tecrubelerim/prisma/schema.prisma", lines.join("\n"), "utf8")
console.log("createdAt eklendi!")