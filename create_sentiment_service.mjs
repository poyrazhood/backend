import { readFileSync, writeFileSync } from "fs"

const service = `
export async function analyzeSentiment(reviewContent, rating) {
  try {
    const prompt = "Asagidaki Turkce musteri yorumunu analiz et ve SADECE JSON formatinda don. " +
      "Baska hicbir sey yazma.\\n\\n" +
      "Yorum: \\"" + reviewContent + "\\"\\n\\n" +
      "Puan: " + rating + "/5\\n\\n" +
      "Yanit formati (sadece bu JSON, baska hicbir sey):\\n" +
      "{\\n" +
      "  \\"sentiment\\": \\"pozitif\\" veya \\"negatif\\" veya \\"notr\\",\\n" +
      "  \\"score\\": 0.0 ile 1.0 arasi sayi,\\n" +
      "  \\"keywords\\": [\\"kelime1\\", \\"kelime2\\", \\"kelime3\\"]\\n" +
      "}"

    const res = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3.1:8b",
        prompt,
        stream: false,
        options: { temperature: 0.1, num_predict: 100 }
      })
    })

    if (!res.ok) return null

    const data = await res.json()
    const text = data.response?.trim() ?? ""
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])
    return {
      sentiment: parsed.sentiment ?? "notr",
      score: parseFloat(parsed.score) ?? 0.5,
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 5) : []
    }
  } catch {
    return null
  }
}
`

writeFileSync("C:/Users/PC/Desktop/tecrubelerim/src/services/sentimentService.js", service, "utf8")
console.log("sentimentService.js olusturuldu!")