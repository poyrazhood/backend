import { readFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/isletme/[slug]/page.tsx", "utf8")
const all = [...content.matchAll(/YetkinlikRadari/g)]
all.forEach(m => console.log("idx:", m.index, "=>", content.substring(m.index - 30, m.index + 80)))