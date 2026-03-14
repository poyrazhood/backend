import { readFileSync, writeFileSync } from "fs"
let content = readFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/reviewRoutes.js", "utf8")

const lines = content.split("\n")

// 317. satir (index 316) = "        }).catch(() => {})"
// Hemen sonrasina radar trigger ekle (index 317)
lines.splice(317, 0, `
        // Radar skorlarini otomatik guncelle (fire-and-forget)
        recalculateRadar(review.businessId).catch(() => {})
`)

writeFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/reviewRoutes.js", lines.join("\n"), "utf8")
console.log("Trigger eklendi! Kontrol:")
for (let i = 314; i < 325; i++) console.log((i+1) + ": " + lines[i])