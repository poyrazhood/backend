import { readFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/sahip-paneli/page.tsx", "utf8")
const lines = content.split("\n")
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("category") || lines[i].includes("/api/businesses") && lines[i].includes("selected")) {
    console.log((i+1) + ": " + lines[i])
  }
}