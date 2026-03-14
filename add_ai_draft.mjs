import { readFileSync, writeFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/sahip-paneli/page.tsx", "utf8")
let fixed = content

// AI draft state ve fonksiyon ekle — replySaving state'inden sonra
fixed = fixed.replace(
  "  const [replySaving, setReplySaving] = useState(false)\n  const [reviews, setReviews]",
  `  const [replySaving, setReplySaving] = useState(false)
  const [aiLoading, setAiLoading] = useState<string | null>(null)
  const [reviews, setReviews]`
)

// getAIDraft fonksiyonu ekle — saveReply fonksiyonundan sonra
const saveReplyFn = `  const saveReply = async (reviewId: string) => {
    setReplySaving(true)
    const token = getToken()
    const res = await fetch(\`\${API}/api/reviews/\${reviewId}/owner-reply\`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: \`Bearer \`+token },
      body: JSON.stringify({ ownerReply: replyText })
    })
    if (res.ok) {
      setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, ownerReply: replyText } : r))
      setReplyingTo(null)
      setReplyText('')
    }
    setReplySaving(false)
  }`

const saveReplyWithAI = saveReplyFn + `

  const getAIDraft = async (reviewId: string) => {
    setAiLoading(reviewId)
    const token = getToken()
    try {
      const res = await fetch(\`\${API}/api/reviews/\${reviewId}/ai-draft\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: \`Bearer \`+token },
        body: '{}'
      })
      const data = await res.json()
      if (data.draft) setReplyText(data.draft)
    } catch {}
    setAiLoading(null)
  }`

fixed = fixed.replace(saveReplyFn, saveReplyWithAI)

writeFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/sahip-paneli/page.tsx", fixed, "utf8")
console.log("AI draft fonksiyon eklendi!")