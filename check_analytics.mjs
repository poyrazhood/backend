import { readFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/businessRoutes.js", "utf8")
const lines = content.split("\n")
for (let i = 398; i < 416; i++) {
  console.log((i+1) + ": " + JSON.stringify(lines[i]))
}