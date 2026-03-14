import { readFileSync, writeFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/sahip-paneli/page.tsx", "utf8")

// Bozuk getAIDraft fonksiyonunu sil
const broken = /\s*const getAIDraft = async[\s\S]*?setAiLoading\(null\)\s*\}/
const fixed1 = content.replace(broken, "")

// Dogru getAIDraft fonksiyonunu saveReply'dan sonra ekle
const correctFn = `

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

const fixed2 = fixed1.replace("  if (loading) return <div className=\"flex justify-center py-12\">", correctFn + "\n\n  if (loading) return <div className=\"flex justify-center py-12\">")

writeFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/sahip-paneli/page.tsx", fixed2, "utf8")
console.log("Duzeltildi!")