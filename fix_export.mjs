import { readFileSync, writeFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/reviewRoutes.js", "utf8")
const fixed = content.trimEnd() + "\nexport default reviewRoutes;\n"
writeFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/reviewRoutes.js", fixed, "utf8")
console.log("Export eklendi!")