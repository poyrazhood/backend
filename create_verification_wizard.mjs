import { writeFileSync } from "fs"

const component = `'use client'
import { useState } from 'react'
import { Shield, Phone, MapPin, CheckCircle, Clock, ChevronRight } from 'lucide-react'

const BADGE_LABELS: Record<string, { label: string, color: string, level: number }> = {
  VERIFIED_GOOGLE:  { label: 'Google Dogrulandi', color: 'text-blue-400',   level: 1 },
  VERIFIED_EMAIL:   { label: 'E-posta Dogrulandi', color: 'text-cyan-400',  level: 2 },
  VERIFIED_SMS:     { label: 'SMS Dogrulandi',     color: 'text-green-400', level: 3 },
  VERIFIED_ADDRESS: { label: 'Adres Dogrulandi',   color: 'text-yellow-400',level: 4 },
  VERIFIED_PLATINUM:{ label: 'Platin Dogrulama',   color: 'text-purple-400',level: 5 },
}

const LEVEL_LABELS = ['Dogrulanmamis', 'Google', 'E-posta', 'SMS (Gumus)', 'Adres (Altin)', 'Platin']
const LEVEL_COLORS = ['text-white/30', 'text-blue-400', 'text-cyan-400', 'text-green-400', 'text-yellow-400', 'text-purple-400']

export default function VerificationWizard({ business }: { business: any }) {
  const [status, setStatus] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'idle'|'sms-input'|'sms-verify'|'address-input'|'done'>('idle')
  const [phone, setPhone] = useState(business.phoneNumber || '')
  const [code, setCode] = useState('')
  const [docUrl, setDocUrl] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\\/api$/, '')
  const getToken = () => localStorage.getItem('token') || ''
  const headers = { 'Content-Type': 'application/json', Authorization: \`Bearer \${getToken()}\` }

  const loadStatus = async () => {
    setLoading(true)
    try {
      const r = await fetch(\`\${API}/api/verification/\${business.id}/status\`, { headers })
      const d = await r.json()
      setStatus(d)
    } finally { setLoading(false) }
  }

  const sendSMS = async () => {
    setError(''); setMsg('')
    const r = await fetch(\`\${API}/api/verification/sms/send\`, {
      method: 'POST', headers,
      body: JSON.stringify({ businessId: business.id, phone })
    })
    const d = await r.json()
    if (!r.ok) { setError(d.error); return }
    setMsg(d.message)
    setStep('sms-verify')
  }

  const verifySMS = async () => {
    setError(''); setMsg('')
    const r = await fetch(\`\${API}/api/verification/sms/verify\`, {
      method: 'POST', headers,
      body: JSON.stringify({ businessId: business.id, code })
    })
    const d = await r.json()
    if (!r.ok) { setError(d.error); return }
    setMsg(d.message)
    setStep('done')
    loadStatus()
  }

  const submitAddress = async () => {
    setError(''); setMsg('')
    const r = await fetch(\`\${API}/api/verification/address/submit\`, {
      method: 'POST', headers,
      body: JSON.stringify({ businessId: business.id, documentUrl: docUrl })
    })
    const d = await r.json()
    if (!r.ok) { setError(d.error); return }
    setMsg(d.message)
    setStep('done')
    loadStatus()
  }

  if (!status && !loading) {
    return (
      <button onClick={loadStatus}
        className="w-full py-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-sm font-semibold hover:bg-indigo-500/20 transition-all flex items-center justify-center gap-2">
        <Shield size={15} /> Dogrulama Durumunu Goster
      </button>
    )
  }

  if (loading) return (
    <div className="flex items-center justify-center h-16">
      <div className="w-6 h-6 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin" />
    </div>
  )

  return (
    <div className="space-y-3">
      {/* Mevcut Seviye */}
      <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/[0.07]">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-bold text-white/70">Dogrulama Seviyesi</div>
          <div className={"text-xs font-black " + LEVEL_COLORS[status?.verificationLevel || 0]}>
            {LEVEL_LABELS[status?.verificationLevel || 0]}
          </div>
        </div>

        {/* Seviye bar */}
        <div className="flex gap-1 mb-3">
          {[1,2,3,4,5].map(l => (
            <div key={l} className={"flex-1 h-1.5 rounded-full " + (l <= (status?.verificationLevel || 0) ? "bg-indigo-500" : "bg-white/10")} />
          ))}
        </div>

        {/* Mevcut rozetler */}
        {status?.badges?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {status.badges.map((b: any) => (
              <span key={b.type} className={"text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/10 " + (BADGE_LABELS[b.type]?.color || 'text-white/50')}>
                ✓ {BADGE_LABELS[b.type]?.label || b.type}
              </span>
            ))}
          </div>
        )}

        {status?.verifiedPhone && (
          <div className="text-[10px] text-white/30 mt-2">Dogrulanan telefon: {status.verifiedPhone}</div>
        )}
      </div>

      {/* SMS Dogrulama */}
      {!status?.badges?.find((b: any) => b.type === 'VERIFIED_SMS') && (
        <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/[0.07]">
          <div className="flex items-center gap-2 mb-3">
            <Phone size={14} className="text-green-400" />
            <div className="text-xs font-bold text-white/70">SMS Dogrulama (Gumus Rozet)</div>
            <span className="ml-auto text-[10px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">+15 TrustScore</span>
          </div>

          {step === 'idle' && (
            <div className="space-y-2">
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="05XXXXXXXXX"
                className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-green-500/50" />
              <button onClick={sendSMS}
                className="w-full py-2 rounded-xl bg-green-500/20 border border-green-500/30 text-green-400 text-xs font-bold hover:bg-green-500/30 transition-all">
                Dogrulama Kodu Gonder
              </button>
            </div>
          )}

          {step === 'sms-verify' && (
            <div className="space-y-2">
              {msg && <div className="text-[11px] text-green-400">{msg}</div>}
              <input type="text" value={code} onChange={e => setCode(e.target.value)}
                placeholder="6 haneli kod" maxLength={6}
                className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-green-500/50 tracking-widest text-center" />
              <button onClick={verifySMS}
                className="w-full py-2 rounded-xl bg-green-500/20 border border-green-500/30 text-green-400 text-xs font-bold hover:bg-green-500/30 transition-all">
                Kodu Dogrula
              </button>
              <button onClick={() => setStep('idle')} className="w-full text-[11px] text-white/30 hover:text-white/50">
                Tekrar gonder
              </button>
            </div>
          )}

          {step === 'done' && msg && (
            <div className="flex items-center gap-2 text-green-400 text-xs">
              <CheckCircle size={14} /> {msg}
            </div>
          )}

          {error && <div className="text-[11px] text-red-400 mt-2">{error}</div>}
        </div>
      )}

      {/* Adres Dogrulama */}
      {!status?.badges?.find((b: any) => b.type === 'VERIFIED_ADDRESS') && (
        <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/[0.07]">
          <div className="flex items-center gap-2 mb-3">
            <MapPin size={14} className="text-yellow-400" />
            <div className="text-xs font-bold text-white/70">Adres Dogrulama (Altin Rozet)</div>
            <span className="ml-auto text-[10px] text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded-full">+20 TrustScore</span>
          </div>

          {status?.pendingAddressReview ? (
            <div className="flex items-center gap-2 text-yellow-400 text-xs">
              <Clock size={14} /> Belgeniz inceleniyor. 1-3 is gunu icinde sonuclanir.
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-[11px] text-white/40">Vergi levhasi veya resmi adres belgesi URL'si girin</div>
              <input type="url" value={docUrl} onChange={e => setDocUrl(e.target.value)}
                placeholder="https://..."
                className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-yellow-500/50" />
              <button onClick={submitAddress} disabled={!docUrl}
                className="w-full py-2 rounded-xl bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 text-xs font-bold hover:bg-yellow-500/30 disabled:opacity-50 transition-all">
                Belge Gonder
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
`

writeFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/components/business/VerificationWizard.tsx", component, "utf8")
console.log("VerificationWizard.tsx olusturuldu!")