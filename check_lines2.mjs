import { readFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/reviewRoutes.js", "utf8")
const lines = content.split("\n")
for (let i = 505; i < 525; i++) {
  console.log((i+1) + ": " + lines[i])
}