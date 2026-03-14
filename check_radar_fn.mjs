import { readFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/reviewRoutes.js", "utf8")
console.log("recalculateRadar var mi:", content.includes("recalculateRadar"))
const idx = content.indexOf("recalculateRadar")
console.log(content.substring(idx, idx + 100))