import { readFileSync, writeFileSync } from "fs"
const content = readFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/reviewRoutes.js", "utf8")
const oldPrompt = /const prompt = `[\s\S]*?Yanit taslagi:`/
const newPrompt = `const prompt = "Sen \\"" + review.business.name + "\\" isletmesinin sahibisin. Asagidaki musteri yorumuna Turkce, kisa (2-3 cumle), " + tone + " bir yanit taslagi yaz. Sadece yanit metnini yaz, baska hicbir sey ekleme.\\n\\nMusteri yorumu (" + rating + "/5 yildiz):\\n\\"" + review.content + "\\"\\n\\nYanit taslagi:"`
const fixed = content.replace(oldPrompt, newPrompt)
writeFileSync("C:/Users/PC/Desktop/tecrubelerim/src/routes/reviewRoutes.js", fixed, "utf8")
console.log("Duzeltildi!")