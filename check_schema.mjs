import { readFileSync, writeFileSync } from "fs"
let schema = readFileSync("C:/Users/PC/Desktop/tecrubelerim/prisma/schema.prisma", "utf8")
const lines = schema.split("\n")
lines.forEach((line, i) => {
  if (line.includes("autoServiceProfile") || line.includes("AutoServiceProfile")) {
    console.log((i+1) + ": " + line)
  }
})