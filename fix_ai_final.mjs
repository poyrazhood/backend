import { readFileSync, writeFileSync } from "fs"
let content = readFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/sahip-paneli/page.tsx", "utf8")

// 1. aiDraftCount state ekle
content = content.replace(
  "  const [aiLoading, setAiLoading] = useState<string | null>(null)",
  "  const [aiLoading, setAiLoading] = useState<string | null>(null)\n  const [aiDraftCount, setAiDraftCount] = useState<Record<string,number>>({})"
)

// 2. getAIDraft fonksiyonunda count kontrolu ekle
content = content.replace(
  `const getAIDraft = async (reviewId: string) => {
    setAiLoading(reviewId)
    const token = getToken()`,
  `const getAIDraft = async (reviewId: string) => {
    if ((aiDraftCount[reviewId] || 0) >= 3) return
    setAiDraftCount(prev => ({ ...prev, [reviewId]: (prev[reviewId] || 0) + 1 }))
    setAiLoading(reviewId)
    const token = getToken()`
)

// 3. model guncelle
content = content.replace("'llama3.2:3b'", "'llama3.1:8b'")

// 4. Buton adini guncelle
content = content.replace(
  `{aiLoading === r.id ? <Loader2 size={11} className="animate-spin" /> : <span>✨</span>} Asistanla Yanıtla</button>`,
  `{aiLoading === r.id ? <Loader2 size={11} className="animate-spin" /> : <span>✨</span>} {aiDraftCount[r.id] ? \`Yanıtı Değiştir (\${3 - (aiDraftCount[r.id] || 0)} hak)\` : 'Asistanla Yanıtla'}</button>`
)

writeFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/sahip-paneli/page.tsx", content, "utf8")
console.log("Duzeltildi!")