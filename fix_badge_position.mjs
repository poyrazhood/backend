import { readFileSync, writeFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/isletme/[slug]/page.tsx", "utf8")
const lines = content.split("\n")

// Rozeti kaldir (434-455 arasi)
let start = -1, end = -1
for (let i = 432; i < 460; i++) {
  if (lines[i] && lines[i].includes("Dogrulama rozeti")) { start = i; }
  if (start > -1 && lines[i] && lines[i].includes(")}`")) { end = i; break }
}
console.log("Rozet satir araligi:", start, "-", end)
if (start > -1 && end > -1) {
  lines.splice(start, end - start + 1)
  console.log("Rozet kaldirildi!")
}

// TrustScoreRing satirini bul ve rozeti icine ekle
for (let i = 430; i < 440; i++) {
  if (lines[i] && lines[i].includes("TrustScoreRing")) {
    console.log("TrustScoreRing satiri:", i+1, lines[i])
    // TrustScoreRing'i sarmalayan div olustur
    lines[i] = lines[i].replace(
      "<TrustScoreRing score={trustScore} size=\"md\" showBreakdown={false} />",
      `<div className="flex flex-col items-center gap-1">
              <TrustScoreRing score={trustScore} size="md" showBreakdown={false} />
              {business.isVerified && (
                <div className="relative group cursor-default">
                  <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
                    <circle cx="11" cy="11" r="11" fill="#4ade80" fillOpacity="0.15"/>
                    <circle cx="11" cy="11" r="10" stroke="#4ade80" strokeOpacity="0.4" strokeWidth="1.5"/>
                    <path d="M6.5 11.5L9.5 14.5L15.5 8.5" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none z-50"
                    style={{background:'rgba(10,20,10,0.95)',border:'1px solid rgba(74,222,128,0.3)',color:'#4ade80',boxShadow:'0 4px 20px rgba(0,0,0,0.5)'}}>
                    ✓ Dogrulanmis Isletme
                  </div>
                </div>
              )}
            </div>`
    )
    break
  }
}

require("fs").writeFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/isletme/[slug]/page.tsx", lines.join("\n"), "utf8")
console.log("Duzeltildi!")