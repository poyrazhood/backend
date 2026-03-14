import { readFileSync, writeFileSync } from "fs"
let content = readFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/isletme/[slug]/page.tsx", "utf8")

// setBusiness satirini bul ve logla
content = content.replace(
  "setBusiness(data)",
  "setBusiness(data); console.log('BUSINESS CATEGORY:', data?.category)"
)

writeFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/isletme/[slug]/page.tsx", content, "utf8")
console.log("Log eklendi!")