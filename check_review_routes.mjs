import { readFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/reviewRoutes.js", "utf8")
const lines = content.split("\n")
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("analyzeSentiment") || lines[i].includes("sentiment") || lines[i].includes("fire") || lines[i].includes("await prisma.review.create")) {
    console.log((i+1) + ": " + lines[i])
  }
}