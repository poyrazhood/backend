import { readFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/isletme/[slug]/page.tsx", "utf8")
const lines = content.split("\n")
for (let i = 428; i < 445; i++) {
  console.log((i+1) + ": " + lines[i])
}