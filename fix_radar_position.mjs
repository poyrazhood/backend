import { readFileSync, writeFileSync } from "fs"
let content = readFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/isletme/[slug]/page.tsx", "utf8")

content = content.replace(
  `{business.category?.slug?.includes('oto') && (\n                <YetkinlikRadari businessId={business.id} businessName={business.name} />\n              )}\n              <a href={mapsUrl}`,
  `<a href={mapsUrl}`
)

const bilgilerIdx = content.indexOf("{activeTab === 'bilgiler'")
console.log("bilgiler tab bulundu:", bilgilerIdx > -1)
console.log("radar hero'da hala var mi:", content.includes("YetkinlikRadari businessId={business.id} businessName={business.name} />\n              )}\n              <a href"))

writeFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/isletme/[slug]/page.tsx", content, "utf8")
console.log("Tamam!")