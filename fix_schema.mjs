import { readFileSync, writeFileSync } from "fs"
let schema = readFileSync("C:/Users/PC/Desktop/tecrubelerim/prisma/schema.prisma", "utf8")

// ownerReplyDate'den sonra sentiment alanlari ekle
schema = schema.replace(
  "  ownerReply             String?",
  `  ownerReply             String?
  ownerReplyDate         DateTime?
  sentiment              String?
  sentimentScore         Float?
  sentimentKeywords      String[]`
)

// Duplicate ownerReplyDate varsa kaldir
schema = schema.replace("  ownerReplyDate         DateTime?\n  ownerReply             String?", "  ownerReply             String?")

writeFileSync("C:/Users/PC/Desktop/tecrubelerim/prisma/schema.prisma", schema, "utf8")
console.log("Schema guncellendi!")