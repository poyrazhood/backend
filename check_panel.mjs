import { readFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/sahip-paneli/page.tsx", "utf8")
console.log("AutoServiceManualForm var mi:", content.includes("AutoServiceManualForm"))
console.log("YetkinlikRadari var mi:", content.includes("YetkinlikRadari"))
const idx = content.indexOf("AutoServiceManualForm")
console.log(content.substring(idx - 50, idx + 100))