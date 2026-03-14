import { readFileSync, writeFileSync } from "fs"
const schema = readFileSync("C:/Users/PC/Desktop/tecrubelerim/prisma/schema.prisma", "utf8")
const lines = schema.split("\n")
lines.forEach((line, i) => {
  if (line.includes("verifiedAt") || line.includes("verifiedBusiness")) {
    console.log((i+1) + ": " + line)
  }
})