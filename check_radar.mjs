import { readFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/isletme/[slug]/page.tsx", "utf8")
const hasRadar = content.includes("YetkinlikRadari")
const hasImport = content.includes("import YetkinlikRadari")
const hasCategoryCheck = content.includes("oto-servis")
console.log("YetkinlikRadari kullanimi:", hasRadar)
console.log("Import var mi:", hasImport)
console.log("Kategori kontrolu:", hasCategoryCheck)