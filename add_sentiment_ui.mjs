import { readFileSync, writeFileSync } from "fs"
let content = readFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/sahip-paneli/page.tsx", "utf8")

const sentimentBlock = `
      {/* Sentiment Analizi */}
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
      )}

      {/* Rakip karsilastirma */}`

content = content.replace("      {/* Rakip karsilastirma */}", sentimentBlock)
writeFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/sahip-paneli/page.tsx", content, "utf8")
console.log("Sentiment dashboard eklendi!")