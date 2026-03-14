import { readFileSync, writeFileSync } from "fs"
let content = readFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/isletme/[slug]/page.tsx", "utf8")

// Eski kontrol ne olursa olsun, contains ile yakala
const before = content.includes("oto-servis")
console.log("onceki durum:", before)

// Kategori kontrolunu slug contains ile degistir
content = content.replace(
  `business.category?.slug === 'oto-servis'`,
  `business.category?.slug?.includes('oto-servis')`
)

writeFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/isletme/[slug]/page.tsx", content, "utf8")
console.log("Duzeltildi!")