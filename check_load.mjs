import { readFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/sahip-paneli/page.tsx", "utf8")
const lines = content.split("\n")
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("setMyBusinesses") || lines[i].includes("setSelected") || lines[i].includes("/api/users/me")) {
    console.log((i+1) + ": " + lines[i])
  }
}