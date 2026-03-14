import { readFileSync } from "fs"
const schema = readFileSync("C:/Users/PC/Desktop/tecrubelerim/prisma/schema.prisma", "utf8")
const idx = schema.indexOf("verifiedAt")
console.log(schema.substring(idx - 20, idx + 200))