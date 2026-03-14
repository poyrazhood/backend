import { readFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/isletme/[slug]/page.tsx", "utf8")
const idx = content.indexOf("YetkinlikRadari")
console.log("Bulunan:", content.substring(idx - 80, idx + 120))