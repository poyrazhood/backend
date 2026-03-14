import { readFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/userRoutes.js", "utf8")
const idx = content.indexOf("me/businesses")
console.log(content.substring(idx, idx + 300))