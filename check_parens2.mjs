import { readFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/reviewRoutes.js", "utf8")
const lines = content.split("\n")
let depth = 0
for (let i = 0; i < lines.length; i++) {
  const line = lines[i]
  for (const ch of line) {
    if (ch === "(") depth++
    if (ch === ")") depth--
  }
  if (i >= 470 && i <= 510) {
    console.log("Satir " + (i+1) + " depth=" + depth + ": " + line.trim())
  }
}