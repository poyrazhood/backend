import { readFileSync, writeFileSync } from "fs"
const schema = readFileSync("C:/Users/PC/Desktop/tecrubelerim/prisma/schema.prisma", "utf8")
const lines = schema.split("\n")
// 144. satir (index 143) = "  reviews            Review[]\r"
// Bu satirdan sonra autoServiceProfile ekle (index 144)
lines.splice(144, 0, "  autoServiceProfile    AutoServiceProfile?\r")
const newSchema = lines.join("\n")
writeFileSync("C:/Users/PC/Desktop/tecrubelerim/prisma/schema.prisma", newSchema, "utf8")
console.log("Eklendi! Kontrol:")
console.log(lines[143])
console.log(lines[144])
console.log(lines[145])