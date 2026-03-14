
export async function analyzeSentiment(reviewContent, rating) {
  try {
    const prompt = "Asagidaki Turkce musteri yorumunu analiz et ve SADECE JSON formatinda don. Baska hicbir sey yazma.\n\n" +
      "Yorum: \"" + reviewContent + "\"\n\n" +
      "Puan: " + rating + "/5\n\n" +
      "Yanit formati:\n{\"sentiment\": \"pozitif\", \"score\": 0.9, \"keywords\": [\"kelime1\"]}"

    const res = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3.1:8b",
        prompt,
        stream: false,
        options: { temperature: 0.1, num_predict: 150 }
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
      score: parseFloat(parsed.score) || 0.5,
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 5) : []
    }
  } catch (e) {
    console.error("Sentiment error:", e.message)
    return null
  }
}
