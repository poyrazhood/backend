import { readFileSync, writeFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/isletme/[slug]/page.tsx", "utf8")
const lines = content.split("\n")

// 556. satirdan (index 555) sonra radar ekle
const radarLine = `              {business.category?.slug?.includes('oto') && (
                <YetkinlikRadari businessId={business.id} businessName={business.name} />
              )}`

lines.splice(556, 0, radarLine)

writeFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/isletme/[slug]/page.tsx", lines.join("\n"), "utf8")
console.log("Eklendi! Kontrol:")
console.log(lines[554])
console.log(lines[555])
console.log(lines[556])
console.log(lines[557])
console.log(lines[558])