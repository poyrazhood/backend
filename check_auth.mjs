import { readFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/authRoutes.js", "utf8")
const idx = content.indexOf("email")
console.log(content.substring(idx - 20, idx + 200))