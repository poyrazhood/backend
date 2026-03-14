import { readFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/sahip-paneli/page.tsx", "utf8")
const lines = content.split("\n")
for (let i = 720; i < 735; i++) {
  console.log((i+1) + ": " + lines[i])
}