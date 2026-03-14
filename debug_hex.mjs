import { readFileSync, writeFileSync } from "fs"

const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/reviewRoutes.js", "utf8")
const lines = content.split("\n")

// 559-607 arasi (ai-draft blogu) satirlari goster
for (let i = 555; i < 610; i++) {
  const hex = Buffer.from(lines[i] || "").toString("hex")
  if (hex.includes("efbbbf") || lines[i].includes("}")) {
    console.log((i+1) + " [HEX]: " + hex)
    console.log((i+1) + " [TXT]: " + lines[i])
  }
}