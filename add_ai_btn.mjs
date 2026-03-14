import { readFileSync, writeFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/sahip-paneli/page.tsx", "utf8")

const oldBtn = `              <div className="flex gap-2">
                <button onClick={() => saveReply(r.id)} disabled={replySaving || !replyText.trim()}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-500 text-white text-xs font-bold disabled:opacity-50">
                  {replySaving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Yanıtla
                </button>
                <button onClick={() => { setReplyingTo(null); setReplyText('') }}
                  className="px-4 py-1.5 rounded-lg bg-white/[0.05] text-white/40 text-xs">İptal</button>
              </div>`

const newBtn = `              <div className="flex gap-2">
                <button onClick={() => getAIDraft(r.id)} disabled={!!aiLoading}
                  className="px-3 py-1.5 rounded-lg bg-violet-500/15 text-violet-400 border border-violet-500/20 text-xs font-bold disabled:opacity-40 hover:bg-violet-500/25 transition-all flex items-center gap-1">
                  {aiLoading === r.id ? <Loader2 size={11} className="animate-spin" /> : <span>✨</span>} AI Taslak
                </button>
                <button onClick={() => saveReply(r.id)} disabled={replySaving || !replyText.trim()}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-500 text-white text-xs font-bold disabled:opacity-50">
                  {replySaving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Yanıtla
                </button>
                <button onClick={() => { setReplyingTo(null); setReplyText('') }}
                  className="px-4 py-1.5 rounded-lg bg-white/[0.05] text-white/40 text-xs">İptal</button>
              </div>`

const fixed = content.replace(oldBtn, newBtn)
if (fixed === content) {
  console.log("HATA: Eslesen metin bulunamadi!")
} else {
  writeFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/sahip-paneli/page.tsx", fixed, "utf8")
  console.log("AI Taslak butonu eklendi!")
}