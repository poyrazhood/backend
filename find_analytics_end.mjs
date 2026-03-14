import { readFileSync, writeFileSync } from "fs"
let content = readFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/sahip-paneli/page.tsx", "utf8")

const lines = content.split("\n")
let analyticsEnd = -1
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("function AutoServiceManualForm")) {
    analyticsEnd = i
    break
  }
}
console.log("AutoServiceManualForm satiri:", analyticsEnd + 1)
console.log(lines[analyticsEnd - 3])
console.log(lines[analyticsEnd - 2])
console.log(lines[analyticsEnd - 1])
console.log(lines[analyticsEnd])