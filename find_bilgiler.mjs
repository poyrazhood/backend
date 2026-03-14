import { readFileSync, writeFileSync } from "fs"
let content = readFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/isletme/[slug]/page.tsx", "utf8")

const lines = content.split("\n")
let bilgilerIdx = -1
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("activeTab === 'bilgiler'")) {
    bilgilerIdx = i
    break
  }
}
console.log("bilgiler satir:", bilgilerIdx + 1)
console.log(lines[bilgilerIdx])
console.log(lines[bilgilerIdx + 1])
console.log(lines[bilgilerIdx + 2])