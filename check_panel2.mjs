import { readFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/sahip-paneli/page.tsx", "utf8")
const idx = content.indexOf("oto-servis")
if (idx > -1) {
  console.log("Radar panel kontrolu:", content.substring(idx - 80, idx + 150))
} else {
  console.log("oto-servis bulunamadi - radar panel'e eklenmemis!")
}