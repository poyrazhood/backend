import { readFileSync, writeFileSync } from "fs"
let content = readFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/isletme/[slug]/page.tsx", "utf8")

content = content.replace(
  `{activeTab === 'bilgiler' && (
            <div className="space-y-3">`,
  `{activeTab === 'bilgiler' && (
            <div className="space-y-3">
              {business.category?.slug?.includes('oto') && (
                <YetkinlikRadari businessId={business.id} businessName={business.name} />
              )}`
)

writeFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/isletme/[slug]/page.tsx", content, "utf8")
console.log("Radar Bilgiler tabina eklendi!")