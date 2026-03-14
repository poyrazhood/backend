import { readFileSync, writeFileSync } from "fs"
let content = readFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/userRoutes.js", "utf8")

content = content.replace(
  "category: { select: { name: true, icon: true } }",
  "category: { select: { name: true, icon: true, slug: true } }"
)

writeFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/userRoutes.js", content, "utf8")
console.log("slug eklendi!")