import { readFileSync, writeFileSync } from "fs"
let content = readFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/sahip-paneli/page.tsx", "utf8")

const oldBlock = `      {/* Sentiment Analizi */}
      {data.sentiment && (
        <div className="p-4 rounded-2xl bg-surface-1 border border-white/[0.07]">
          <div className="text-xs font-bold text-white/70 mb-3">Duygu Analizi</div>
          <div className="flex gap-3 mb-4">
            <div className="flex-1 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
              <div className="text-lg font-black text-emerald-400">{data.sentiment.distribution.pozitif || 0}</div>
              <div className="text-[10px] text-white/40 mt-0.5">Pozitif</div>
            </div>
            <div className="flex-1 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
              <div className="text-lg font-black text-amber-400">{data.sentiment.distribution.notr || 0}</div>
              <div className="text-[10px] text-white/40 mt-0.5">Notr</div>
            </div>
            <div className="flex-1 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
              <div className="text-lg font-black text-red-400">{data.sentiment.distribution.negatif || 0}</div>
              <div className="text-[10px] text-white/40 mt-0.5">Negatif</div>
            </div>
          </div>
          {data.sentiment.topKeywords?.length > 0 && (
            <div>
              <div className="text-[10px] text-white/40 mb-2">En Cok Gecen Kelimeler</div>
              <div className="flex flex-wrap gap-1.5">
                {data.sentiment.topKeywords.map((k: any) => (
                  <span key={k.word} className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    {k.word} <span className="opacity-50">({k.count})</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}`

const newBlock = `      {/* Sentiment Analizi */}
      {data.sentiment && (() => {
        const dist = data.sentiment.distribution
        const total = (dist.pozitif || 0) + (dist.notr || 0) + (dist.negatif || 0)
        const poz = total > 0 ? Math.round((dist.pozitif || 0) / total * 100) : 0
        const notr = total > 0 ? Math.round((dist.notr || 0) / total * 100) : 0
        const neg = total > 0 ? Math.round((dist.negatif || 0) / total * 100) : 0
        return (
          <div className="p-4 rounded-2xl bg-surface-1 border border-white/[0.07]">
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs font-bold text-white/70">Duygu Analizi</div>
              <div className="text-[10px] text-white/30">{total} yorum analiz edildi</div>
            </div>
            <div className="h-3 rounded-full overflow-hidden flex mb-4 gap-0.5">
              {poz > 0 && <div className="bg-emerald-500 rounded-full transition-all" style={{width: poz + '%'}} />}
              {notr > 0 && <div className="bg-amber-500/70 rounded-full transition-all" style={{width: notr + '%'}} />}
              {neg > 0 && <div className="bg-red-500/70 rounded-full transition-all" style={{width: neg + '%'}} />}
            </div>
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                <div>
                  <div className="text-sm font-bold text-white">{poz}%</div>
                  <div className="text-[10px] text-white/30">Pozitif</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-500/70 flex-shrink-0" />
                <div>
                  <div className="text-sm font-bold text-white">{notr}%</div>
                  <div className="text-[10px] text-white/30">Nötr</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500/70 flex-shrink-0" />
                <div>
                  <div className="text-sm font-bold text-white">{neg}%</div>
                  <div className="text-[10px] text-white/30">Negatif</div>
                </div>
              </div>
            </div>
            {data.sentiment.topKeywords?.length > 0 && (
              <div className="pt-3 border-t border-white/[0.05]">
                <div className="text-[10px] font-semibold text-white/40 mb-2 uppercase tracking-wider">Öne Çıkan Kelimeler</div>
                <div className="flex flex-wrap gap-1.5">
                  {data.sentiment.topKeywords.map((k: any) => (
                    <span key={k.word} className="text-[10px] px-2.5 py-1 rounded-full bg-white/[0.05] text-white/60 border border-white/[0.08] hover:bg-white/[0.08] transition-all">
                      {k.word}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })()}`

content = content.replace(oldBlock, newBlock)
writeFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/sahip-paneli/page.tsx", content, "utf8")
console.log("Sentiment UI guncellendi!")