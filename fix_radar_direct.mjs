import { readFileSync, writeFileSync } from "fs"
let content = readFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/isletme/[slug]/page.tsx", "utf8")

// Google Maps butonunu bul ve ondan once radar ekle
const target = `<a href={mapsUrl}`
const replacement = `{business.category?.slug?.includes('oto') && (
                <YetkinlikRadari businessId={business.id} businessName={business.name} />
              )}
              <a href={mapsUrl}`

if (content.includes(target)) {
  content = content.replace(target, replacement)
  writeFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/isletme/[slug]/page.tsx", content, "utf8")
  console.log("Eklendi!")
} else {
  console.log("Target bulunamadi, mapsUrl satirini goster:")
  const idx = content.indexOf("mapsUrl")
  console.log(content.substring(idx - 100, idx + 150))
}