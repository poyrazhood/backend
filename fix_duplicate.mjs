import { readFileSync, writeFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/reviewRoutes.js", "utf8")
const lines = content.split("\n")

// 502-533 arasi duplicate route'u bul ve sil (/:id/report)
let start = -1, end = -1
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("POST /:id/report -- Yorum Sikayeti")) start = i
  if (start > -1 && end === -1 && i > start && lines[i].trim() === "})") { end = i; break }
}
console.log("Silinecek satirlar:", start+1, "-", end+1)
const fixed = [...lines.slice(0, start), ...lines.slice(end + 1)].join("\n")
writeFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/reviewRoutes.js", fixed, "utf8")
console.log("Duplicate route silindi!")