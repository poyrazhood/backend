import { readFileSync, writeFileSync } from "fs"
let schema = readFileSync("C:/Users/PC/Desktop/tecrubelerim/prisma/schema.prisma", "utf8")

// Tum Review modelini goster
const lines = schema.split("\n")
lines.forEach((line, i) => {
  if (i >= 219 && i <= 260) console.log((i+1) + ": " + line)
})