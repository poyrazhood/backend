import { readFileSync, writeFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/reviewRoutes.js", "utf8")

const oldPrompt = /const prompt = "Sen.*?Yanit taslagi:"/s
const newPrompt = `const prompt = "Bir işletme sahibi olarak müşteri yorumuna kısa, samimi ve profesyonel Türkçe bir yanıt yaz. " +
        "Yanıt 2-3 cümle olsun. Müşteriyi ismiyle değil 'değerli misafirimiz' diye hitap et. " +
        "Sadece yanıt metnini yaz, başka hiçbir şey ekleme, tırnak işareti kullanma.\\n\\n" +
        "İşletme adı: " + review.business.name + "\\n" +
        "Yorum puanı: " + rating + "/5\\n" +
        "Müşteri yorumu: " + review.content + "\\n\\n" +
        "Yanıt:"`

const fixed = content.replace(oldPrompt, newPrompt)
if (fixed === content) {
  console.log("HATA: eslesmedi")
} else {
  writeFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/reviewRoutes.js", fixed, "utf8")
  console.log("Prompt guncellendi!")
}