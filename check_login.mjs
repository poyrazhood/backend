import { readFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/authRoutes.js", "utf8")
const loginIdx = content.indexOf("login")
console.log(content.substring(loginIdx, loginIdx + 400))