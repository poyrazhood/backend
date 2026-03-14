import { readFileSync, writeFileSync } from "fs"
let schema = readFileSync("C:/Users/PC/Desktop/tecrubelerim/prisma/schema.prisma", "utf8")
const lines = schema.split("\n")
lines.forEach((line, i) => {
  if (i >= 235 && i <= 255) console.log((i+1) + ": " + line)
})