import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
await prisma.$connect()
const reviews = await prisma.$queryRawUnsafe(`SELECT id, content, rating FROM "Review" WHERE sentiment IS NULL`)
const r = reviews[0]
console.log("Yorum:", r.content, "Puan:", r.rating)

const prompt = "Asagidaki Turkce musteri yorumunu analiz et ve SADECE JSON formatinda don. Baska hicbir sey yazma.\n\nYorum: \"" + r.content + "\"\n\nPuan: " + r.rating + "/5\n\nYanit formati:\n{\"sentiment\": \"pozitif\", \"score\": 0.9, \"keywords\": [\"kelime1\"]}"

const res = await fetch("http://localhost:11434/api/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ model: "llama3.1:8b", prompt, stream: false, options: { temperature: 0.1, num_predict: 150 } })
})
const data = await res.json()
console.log("Ollama yaniti:", data.response)
await prisma.$disconnect()