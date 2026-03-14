import { readFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/reviewRoutes.js", "utf8")
const lines = content.split("\n")
lines.forEach((line, i) => {
  if (i >= 570 && i <= 615) {
    console.log((i+1) + ": " + line)
  }
})