import { readFileSync, writeFileSync } from "fs"
let content = readFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/components/business/YetkinlikRadari.tsx", "utf8")

// API URL duzelt - /api prefix'i kaldir, sadece base URL kullan
content = content.replace(
  "const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'",
  "const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\\/api$/, '')"
)

writeFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/components/business/YetkinlikRadari.tsx", content, "utf8")
console.log("API URL duzeltildi!")