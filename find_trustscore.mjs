import { readFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/isletme/[slug]/page.tsx", "utf8")
const lines = content.split("\n")
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("TrustScore") || lines[i].includes("trustScore") || lines[i].includes("RingScore")) {
    console.log((i+1) + ": " + lines[i])
  }
}