import { readFileSync, writeFileSync } from "fs"
let content = readFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/isletme/[slug]/page.tsx", "utf8")
const lines = content.split("\n")

// TrustScoreRing'den sonra rozet ekle - 433. satir kapanma div
// 432: <TrustScoreRing ... />
// 433: </div>
const badge = `
              {/* Dogrulama rozeti - Twitter tiki gibi */}
              {business.isVerified && (
                <div className="flex flex-col items-center gap-1 mt-1">
                  <div className="relative group">
                    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                      <circle cx="11" cy="11" r="11" fill="#4ade80" fillOpacity="0.15"/>
                      <circle cx="11" cy="11" r="10" stroke="#4ade80" strokeOpacity="0.3" strokeWidth="1"/>
                      <path d="M6.5 11.5L9.5 14.5L15.5 8.5" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {/* Tooltip */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none z-50"
                      style={{background: 'rgba(15,20,15,0.95)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', boxShadow: '0 4px 20px rgba(0,0,0,0.5)'}}>
                      ✓ Dogrulanmis Isletme
                      <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0" style={{borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: '4px solid rgba(74,222,128,0.3)'}} />
                    </div>
                  </div>
                </div>
              )}`

lines.splice(432, 0, badge)
writeFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/isletme/[slug]/page.tsx", lines.join("\n"), "utf8")
console.log("Rozet eklendi!")