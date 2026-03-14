import { readFileSync, writeFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/sahip-paneli/page.tsx", "utf8")
const lines = content.split("\n")

const radarBlock = `
      {/* Yetkinlik Radari - sadece oto servis icin */}
      {business.category?.slug?.includes('oto') && (
        <div className="space-y-3 mt-4">
          <YetkinlikRadari businessId={business.id} businessName={business.name} />
          <AutoServiceManualForm businessId={business.id} />
        </div>
      )}`

// 474. satir (index 473) = bos satir, 475 = "    </div>"
lines.splice(474, 0, radarBlock)

writeFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/sahip-paneli/page.tsx", lines.join("\n"), "utf8")
console.log("Radar Analytics tabina eklendi!")
console.log(lines[472])
console.log(lines[473])
console.log(lines[474])
console.log(lines[475])
console.log(lines[476])