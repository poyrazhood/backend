import { readFileSync, writeFileSync } from "fs"
const pkg = JSON.parse(readFileSync("C:/Users/PC/Desktop/tecrubelerim/package.json", "utf8"))

pkg.scripts["fix:bom"] = "node scripts/fix-bom.mjs"
pkg.scripts["db:generate"] = "node scripts/fix-bom.mjs && prisma generate"
pkg.scripts["db:push"] = "node scripts/fix-bom.mjs && prisma db push --skip-generate"
pkg.scripts["predev"] = "node scripts/fix-bom.mjs"

writeFileSync("C:/Users/PC/Desktop/tecrubelerim/package.json", JSON.stringify(pkg, null, 2), "utf8")
console.log("package.json guncellendi!")