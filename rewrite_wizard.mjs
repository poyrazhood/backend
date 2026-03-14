import { writeFileSync } from "fs"

const component = `'use client'
import { useState } from 'react'
import { Shield, Phone, MapPin, CheckCircle, Clock, Star, Lock, ChevronRight, Sparkles } from 'lucide-react'

const BADGE_LABELS: Record<string, { label: string, color: string, bg: string, level: number }> = {
  VERIFIED_GOOGLE:  { label: 'Google',  color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  level: 1 },
  VERIFIED_EMAIL:   { label: 'E-posta', color: '#34d399', bg: 'rgba(52,211,153,0.1)',  level: 2 },
  VERIFIED_SMS:     { label: 'SMS',     color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  level: 3 },
  VERIFIED_ADDRESS: { label: 'Adres',   color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  level: 4 },
  VERIFIED_PLATINUM:{ label: 'Platin',  color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', level: 5 },
}

const STEPS = [
  { level: 1, icon: '🔍', label: 'Google',  color: '#60a5fa' },
  { level: 2, icon: '✉️', label: 'E-posta', color: '#34d399' },
  { level: 3, icon: '📱', label: 'SMS',     color: '#4ade80' },
  { level: 4, icon: '📍', label: 'Adres',   color: '#fbbf24' },
  { level: 5, icon: '💎', label: 'Platin',  color: '#a78bfa' },
]

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
      method: 'POST', headers, body: JSON.stringify({ businessId: business.id, phone })
    })
    const d = await r.json()
    if (!r.ok) { setError(d.error); return }
    setMsg(d.message); setStep('sms-verify')
  }

  const verifySMS = async () => {
    setError(''); setMsg('')
    const r = await fetch(\`\${API}/api/verification/sms/verify\`, {
      method: 'POST', headers, body: JSON.stringify({ businessId: business.id, code })
    })
    const d = await r.json()
    if (!r.ok) { setError(d.error); return }
    setMsg(d.message); setStep('done'); loadStatus()
  }

  const submitAddress = async () => {
    setError(''); setMsg('')
    const r = await fetch(\`\${API}/api/verification/address/submit\`, {
      method: 'POST', headers, body: JSON.stringify({ businessId: business.id, documentUrl: docUrl })
    })
    const d = await r.json()
    if (!r.ok) { setError(d.error); return }
    setMsg(d.message); setStep('done'); loadStatus()
  }

  const level = status?.verificationLevel || 0
  const hasSMS = status?.badges?.find((b: any) => b.type === 'VERIFIED_SMS')
  const hasAddress = status?.badges?.find((b: any) => b.type === 'VERIFIED_ADDRESS')

  if (!status && !loading) {
    return (
      <button onClick={loadStatus}
        className="group w-full relative overflow-hidden py-4 rounded-2xl transition-all duration-300"
        style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(139,92,246,0.1) 100%)', border: '1px solid rgba(99,102,241,0.25)' }}>
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.25) 0%, rgba(139,92,246,0.2) 100%)' }} />
        <div className="relative flex items-center justify-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.2)' }}>
            <Shield size={15} className="text-indigo-400" />
          </div>
          <div className="text-left">
            <div className="text-sm font-bold text-white">Isletmeni Dogrula</div>
            <div className="text-[10px] text-white/40">TrustScore bonusu kazan, rozet al</div>
          </div>
          <ChevronRight size={14} className="text-white/30 ml-auto mr-1 group-hover:translate-x-1 transition-transform" />
        </div>
      </button>
    )
  }

  if (loading) return (
    <div className="flex items-center justify-center h-20">
      <div className="w-6 h-6 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin" />
    </div>
  )

  return (
    <div className="space-y-3">
      {/* Header - Seviye Gostergesi */}
      <div className="relative overflow-hidden rounded-2xl p-4"
        style={{ background: 'linear-gradient(135deg, rgba(15,15,25,0.9) 0%, rgba(25,20,40,0.9) 100%)', border: '1px solid rgba(255,255,255,0.07)' }}>
        
        {/* Arkaplan efekti */}
        <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10 blur-2xl"
          style={{ background: level >= 3 ? '#4ade80' : level >= 2 ? '#34d399' : '#6366f1', transform: 'translate(30%, -30%)' }} />

        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[10px] text-white/40 font-medium uppercase tracking-wider mb-0.5">Dogrulama Durumu</div>
            <div className="text-sm font-black text-white">
              {level === 0 && 'Dogrulanmamis'}
              {level === 1 && 'Google Dogrulandi'}
              {level === 2 && 'E-posta Dogrulandi'}
              {level === 3 && '🥈 Gumus Rozet'}
              {level === 4 && '🥇 Altin Rozet'}
              {level === 5 && '💎 Platin Rozet'}
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black" style={{ color: STEPS[Math.max(level-1,0)]?.color || 'rgba(255,255,255,0.2)' }}>
              {level > 0 ? '+' + [0,5,8,15,20,35][level] : '0'}
            </div>
            <div className="text-[9px] text-white/30">TrustScore</div>
          </div>
        </div>

        {/* Step indikatoru */}
        <div className="flex items-center gap-1">
          {STEPS.map((s, i) => (
            <div key={s.level} className="flex items-center gap-1 flex-1">
              <div className="flex-1 relative">
                <div className="flex flex-col items-center gap-1">
                  <div className={"w-7 h-7 rounded-xl flex items-center justify-center text-sm transition-all duration-500 " + (level >= s.level ? "shadow-lg" : "opacity-30")}
                    style={level >= s.level ? { background: s.color + '22', border: \`1px solid \${s.color}44\` } : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    {level >= s.level ? <span>{s.icon}</span> : <Lock size={10} className="text-white/20" />}
                  </div>
                  <div className={"text-[9px] font-medium " + (level >= s.level ? "text-white/60" : "text-white/20")}>{s.label}</div>
                </div>
              </div>
              {i < STEPS.length - 1 && (
                <div className="w-4 h-px mb-4 flex-shrink-0" style={{ background: level > s.level ? s.color + '60' : 'rgba(255,255,255,0.08)' }} />
              )}
            </div>
          ))}
        </div>

        {status?.verifiedPhone && (
          <div className="mt-2 text-[10px] text-white/25 flex items-center gap-1">
            <Phone size={9} /> {status.verifiedPhone}
          </div>
        )}
      </div>

      {/* SMS Dogrulama Karti */}
      {!hasSMS && (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(74,222,128,0.15)' }}>
          <div className="px-4 py-3 flex items-center gap-2.5"
            style={{ background: 'linear-gradient(135deg, rgba(74,222,128,0.08) 0%, rgba(52,211,153,0.04) 100%)' }}>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.25)' }}>
              <Phone size={14} style={{ color: '#4ade80' }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-white">SMS Dogrulama</div>
              <div className="text-[10px] text-white/40">Gumus Rozet · Telefon numaranizi dogrulayin</div>
            </div>
            <div className="text-[10px] font-black px-2 py-1 rounded-lg flex-shrink-0"
              style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.2)' }}>
              +15
            </div>
          </div>

          <div className="px-4 pb-4 pt-3" style={{ background: 'rgba(0,0,0,0.2)' }}>
            {step === 'idle' && (
              <div className="space-y-2">
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="05XX XXX XX XX"
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none transition-all"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                  onFocus={e => e.target.style.borderColor = 'rgba(74,222,128,0.4)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'} />
                <button onClick={sendSMS}
                  className="w-full py-2.5 rounded-xl text-xs font-bold transition-all duration-200 hover:opacity-90 active:scale-[0.98]"
                  style={{ background: 'linear-gradient(135deg, #4ade80, #22c55e)', color: '#0a1a0a' }}>
                  Dogrulama Kodu Gonder →
                </button>
              </div>
            )}

            {step === 'sms-verify' && (
              <div className="space-y-2">
                {msg && <div className="text-[11px] px-3 py-2 rounded-lg" style={{ background: 'rgba(74,222,128,0.1)', color: '#4ade80' }}>{msg}</div>}
                <input type="text" value={code} onChange={e => setCode(e.target.value)}
                  placeholder="• • • • • •" maxLength={6}
                  className="w-full px-3 py-3 rounded-xl text-lg font-black text-white text-center placeholder-white/15 tracking-[0.5em] focus:outline-none transition-all"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(74,222,128,0.3)' }} />
                <button onClick={verifySMS}
                  className="w-full py-2.5 rounded-xl text-xs font-bold transition-all duration-200 hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg, #4ade80, #22c55e)', color: '#0a1a0a' }}>
                  Kodu Dogrula ✓
                </button>
                <button onClick={() => { setStep('idle'); setCode('') }}
                  className="w-full text-[11px] text-white/30 hover:text-white/50 transition-colors py-1">
                  Farkli numara kullan
                </button>
              </div>
            )}

            {step === 'done' && msg.includes('SMS') && (
              <div className="flex items-center gap-2 py-1">
                <CheckCircle size={14} style={{ color: '#4ade80' }} />
                <span className="text-xs" style={{ color: '#4ade80' }}>{msg}</span>
              </div>
            )}

            {error && <div className="mt-2 text-[11px] px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>{error}</div>}
          </div>
        </div>
      )}

      {/* Adres Dogrulama Karti */}
      {!hasAddress && (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(251,191,36,0.15)' }}>
          <div className="px-4 py-3 flex items-center gap-2.5"
            style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.08) 0%, rgba(245,158,11,0.04) 100%)' }}>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.25)' }}>
              <MapPin size={14} style={{ color: '#fbbf24' }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-white">Adres Dogrulama</div>
              <div className="text-[10px] text-white/40">Altin Rozet · Vergi levhasi veya resmi belge</div>
            </div>
            <div className="text-[10px] font-black px-2 py-1 rounded-lg flex-shrink-0"
              style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}>
              +20
            </div>
          </div>

          <div className="px-4 pb-4 pt-3" style={{ background: 'rgba(0,0,0,0.2)' }}>
            {status?.pendingAddressReview ? (
              <div className="flex items-center gap-2 py-1 px-3 rounded-lg" style={{ background: 'rgba(251,191,36,0.08)' }}>
                <Clock size={12} style={{ color: '#fbbf24' }} />
                <span className="text-[11px]" style={{ color: '#fbbf24' }}>Belgeniz inceleniyor. 1-3 is gunu icinde sonuclanir.</span>
              </div>
            ) : (
              <div className="space-y-2">
                <input type="url" value={docUrl} onChange={e => setDocUrl(e.target.value)}
                  placeholder="Belge URL'si (vergi levhasi, vs.)"
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none transition-all"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                  onFocus={e => e.target.style.borderColor = 'rgba(251,191,36,0.4)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'} />
                <button onClick={submitAddress} disabled={!docUrl}
                  className="w-full py-2.5 rounded-xl text-xs font-bold transition-all duration-200 hover:opacity-90 disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#1a1200' }}>
                  Belge Gonder →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tum rozetler tamamsa */}
      {hasSMS && hasAddress && (
        <div className="p-4 rounded-2xl text-center"
          style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.1), rgba(167,139,250,0.1))', border: '1px solid rgba(251,191,36,0.2)' }}>
          <div className="text-2xl mb-1">🏆</div>
          <div className="text-sm font-black text-white">Tam Dogrulanmis Isletme</div>
          <div className="text-[11px] text-white/40 mt-0.5">Arama sonuclarinda one cikar, musteriler daha cok guvensin</div>
        </div>
      )}
    </div>
  )
}
`

writeFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/components/business/VerificationWizard.tsx", component, "utf8")
console.log("VerificationWizard yeniden yazildi!")