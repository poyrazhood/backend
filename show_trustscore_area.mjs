import { readFileSync, writeFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/isletme/[slug]/page.tsx", "utf8")
const lines = content.split("\n")
for (let i = 429; i < 440; i++) {
  console.log((i+1) + ": " + lines[i])
}