import { readFileSync, writeFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/reviewRoutes.js", "utf8")
if (content.charCodeAt(0) === 0xFEFF) {
  console.log("BOM var! Kaldiriliyor...")
  writeFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/reviewRoutes.js", content.slice(1), "utf8")
  console.log("BOM kaldirildi!")
} else {
  console.log("BOM yok, baska sorun var")
  // 607. satirda ne var hex olarak goster
  const lines = content.split("\n")
  const line = lines[606]
  console.log("607. satir:", JSON.stringify(line))
  console.log("Hex:", Buffer.from(line).toString("hex"))
}