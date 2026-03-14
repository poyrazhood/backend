import { readFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/reviewRoutes.js", "utf8")
const lines = content.split("\n")
lines.forEach((line, i) => {
  if (line.includes("export") || line.includes("export default")) {
    console.log((i+1) + ": " + line)
  }
})
console.log("Son 5 satir:")
lines.slice(-5).forEach((line, i) => console.log((lines.length - 5 + i + 1) + ": " + line))