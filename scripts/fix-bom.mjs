import { readFileSync, writeFileSync } from "fs"
import { resolve } from "path"

const files = [
  "prisma/schema.prisma",
  "src/routes/reviewRoutes.js",
  "src/routes/businessRoutes.js",
  "src/routes/authRoutes.js",
  "src/index.js"
]

let fixed = 0
for (const file of files) {
  try {
    const path = resolve(file)
    const content = readFileSync(path, "utf8")
    if (content.charCodeAt(0) === 0xFEFF) {
      writeFileSync(path, content.slice(1), "utf8")
      console.log("BOM kaldirildi:", file)
      fixed++
    }
  } catch {}
}
console.log(fixed > 0 ? `${fixed} dosyadan BOM kaldirildi.` : "BOM bulunamadi, her sey temiz.")