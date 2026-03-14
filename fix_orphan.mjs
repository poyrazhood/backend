import { readFileSync, writeFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/reviewRoutes.js", "utf8")
const lines = content.split("\n")

// 503-518 arasi orphan kodu sil (index 502-517)
const fixed = [...lines.slice(0, 502), ...lines.slice(518)].join("\n")
writeFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/reviewRoutes.js", fixed, "utf8")
console.log("Orphan kod silindi!")