import { readFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/isletme/[slug]/page.tsx", "utf8")
const idx = content.indexOf("oto-servis")
if (idx > -1) {
  console.log("Bulunan satir:", content.substring(idx - 50, idx + 80))
} else {
  console.log("oto-servis bulunamadi!")
}