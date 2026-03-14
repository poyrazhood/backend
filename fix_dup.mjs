import { readFileSync, writeFileSync } from "fs"
const schema = readFileSync("C:/Users/PC/Desktop/tecrubelerim/prisma/schema.prisma", "utf8")
const lines = schema.split("\n")
let removed = false
const newLines = lines.filter(line => {
  if (!removed && line.includes("autoServiceProfile")) { removed = true; return true }
  if (removed && line.includes("autoServiceProfile")) { removed = false; return false }
  return true
})
writeFileSync("C:/Users/PC/Desktop/tecrubelerim/prisma/schema.prisma", newLines.join("\n"), "utf8")
console.log("Duplicate silindi!")