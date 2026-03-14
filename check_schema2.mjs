import { readFileSync } from "fs"
const schema = readFileSync("C:/Users/PC/Desktop/tecrubelerim/prisma/schema.prisma", "utf8")
console.log("verificationLevel var mi:", schema.includes("verificationLevel"))
console.log("verifiedPhone var mi:", schema.includes("verifiedPhone"))