import { readFileSync, writeFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/sahip-paneli/page.tsx", "utf8")

const broken = /const getAIDraft = async \(reviewId: string\) => \{[\s\S]*?setAiLoading\(null\)\s*\}/

const correct = `const getAIDraft = async (reviewId: string) => {
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

const fixed = content.replace(broken, correct)
if (fixed === content) {
  console.log("HATA: eslesmedi")
} else {
  writeFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/sahip-paneli/page.tsx", fixed, "utf8")
  console.log("Duzeltildi!")
}