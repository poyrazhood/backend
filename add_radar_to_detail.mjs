import { readFileSync, writeFileSync } from "fs"
let content = readFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/isletme/[slug]/page.tsx", "utf8")

// Import ekle
content = content.replace(
  "import { cn } from '@/lib/utils'",
  "import { cn } from '@/lib/utils'\nimport YetkinlikRadari from '@/components/business/YetkinlikRadari'"
)

// Bilgiler tabina radar ekle - Google Maps butonundan once
content = content.replace(
  `              <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-indigo-500/15 border border-indigo-500/25 text-indigo-400 text-sm font-semibold hover:bg-indigo-500/20 transition-colors">
                <Navigation size={15} />Google Maps'te Ac
              </a>`,
  `              {business.category?.slug === 'oto-servis' && (
                <YetkinlikRadari businessId={business.id} businessName={business.name} />
              )}
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-indigo-500/15 border border-indigo-500/25 text-indigo-400 text-sm font-semibold hover:bg-indigo-500/20 transition-colors">
                <Navigation size={15} />Google Maps'te Ac
              </a>`
)

writeFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/isletme/[slug]/page.tsx", content, "utf8")
console.log("Radar detay sayfasina eklendi!")