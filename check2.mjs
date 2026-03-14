import { readFileSync } from "fs"
const schema = readFileSync("C:/Users/PC/Desktop/tecrubelerim/prisma/schema.prisma", "utf8")
const lines = schema.split("\n")
lines.forEach((line, i) => {
  if (line.includes("reviews") || line.includes("Review")) console.log((i+1) + ": " + JSON.stringify(line))
})