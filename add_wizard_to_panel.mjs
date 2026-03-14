import { readFileSync, writeFileSync } from "fs"
let content = readFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/sahip-paneli/page.tsx", "utf8")

// Import ekle
content = content.replace(
  `'use client'
// @ts-ignore
import YetkinlikRadari from '@/components/business/YetkinlikRadari'`,
  `'use client'
// @ts-ignore
import YetkinlikRadari from '@/components/business/YetkinlikRadari'
// @ts-ignore
import VerificationWizard from '@/components/business/VerificationWizard'`
)

// Overview tabinda "Bilgileri Duzenle" butonundan once wizard ekle
content = content.replace(
  `{/* Edit Tab */}`,
  `{/* Verification Tab - Overview icinde */}
            {activeTab === 'overview' && selected && (
              <div className="mt-3">
                <VerificationWizard business={selected} />
              </div>
            )}
            {/* Edit Tab */}`
)

writeFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/sahip-paneli/page.tsx", content, "utf8")
console.log("VerificationWizard panele eklendi!")