import { readFileSync, writeFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/reviewRoutes.js", "utf8")
const lines = content.split("\n")

// 501. satir (index 500) bos — buraya  }); ekle
lines[500] = "  });\n"

const fixed = lines.join("\n")
writeFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/reviewRoutes.js", fixed, "utf8")
console.log("Duzeltildi!")