import { readFileSync, writeFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/sahip-paneli/page.tsx", "utf8")

// Yanlis yerdeki getAIDraft fonksiyonunu sil
const wrongFn = /\n\n\s*const getAIDraft = async \(reviewId: string\) => \{[\s\S]*?setAiLoading\(null\)\s*\}\n/
const fixed1 = content.replace(wrongFn, "\n")

// ReviewsTab'daki setReplySaving(false) satirindan sonra ekle
const correctFn = `
    setReplySaving(false)
  }

  const getAIDraft = async (reviewId: string) => {
    setAiLoading(reviewId)
    const token = getToken()
    try {
      const res = await fetch(\`\${API}/api/reviews/\${reviewId}/ai-draft\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: \`Bearer \${token}\` },
        body: '{}'
      })
      const data = await res.json()
      if (data.draft) setReplyText(data.draft)
    } catch {}
    setAiLoading(null)
  }`

// ReviewsTab'daki saveReply'in setReplySaving(false)'dan sonra ekle (ikinci occurrence)
let count = 0
const fixed2 = fixed1.replace(/\n    setReplySaving\(false\)\n  \}/g, (match) => {
  count++
  return count === 2 ? correctFn : match
})

// Buton adini guncelle
const fixed3 = fixed2.replace(
  '>✨</span>} AI Taslak</button>',
  '>✨</span>} Asistanla Yanıtla</button>'
)

writeFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/sahip-paneli/page.tsx", fixed3, "utf8")
console.log("Duzeltildi!")