import { writeFileSync } from "fs"

const component = `'use client'
import { useEffect, useState, useRef } from 'react'

interface RadarScore {
  scoreTecrube: number
  scoreFiyatSeffafligi: number
  scoreTeknikYetkinlik: number
  scoreMusteriIliskileri: number
  scoreEkipman: number
  scoreGaranti: number
  ustaSicili?: number
  liftSayisi?: number
  garantiSuresiAy?: number
  sertifikalar?: string[]
  uzmanlikAlanlari?: string[]
  totalRatings?: number
}

interface Props {
  businessId: string
  businessName?: string
  compact?: boolean
  showIndustryAvg?: boolean
}

const AXES = [
  { key: 'scoreTecrube',          label: 'Tecrübe',           color: '#6366f1' },
  { key: 'scoreFiyatSeffafligi',  label: 'Fiyat Şeffaflığı',  color: '#10b981' },
  { key: 'scoreTeknikYetkinlik',  label: 'Teknik Yetkinlik',  color: '#f59e0b' },
  { key: 'scoreMusteriIliskileri',label: 'Müşteri İlişkileri', color: '#ec4899' },
  { key: 'scoreEkipman',          label: 'Ekipman',           color: '#3b82f6' },
  { key: 'scoreGaranti',          label: 'Garanti',           color: '#8b5cf6' },
]

const INDUSTRY_AVG: Record<string,number> = {
  scoreTecrube: 62, scoreFiyatSeffagligi: 55, scoreTeknikYetkinlik: 60,
  scoreMusteriIliskileri: 65, scoreEkipman: 50, scoreGaranti: 58
}

function polarToXY(angle: number, r: number, cx: number, cy: number) {
  const rad = (angle - 90) * (Math.PI / 180)
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function buildPath(scores: number[], cx: number, cy: number, maxR: number) {
  const n = scores.length
  return scores.map((s, i) => {
    const angle = (360 / n) * i
    const r = (s / 100) * maxR
    const { x, y } = polarToXY(angle, r, cx, cy)
    return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1)
  }).join(' ') + ' Z'
}

export default function YetkinlikRadari({ businessId, businessName, compact = false, showIndustryAvg = true }: Props) {
  const [profile, setProfile] = useState<RadarScore | null>(null)
  const [loading, setLoading] = useState(true)
  const [animated, setAnimated] = useState(false)
  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

  useEffect(() => {
    fetch(API + '/api/auto-service/' + businessId)
      .then(r => r.json())
      .then(d => {
        if (d.exists) setProfile(d.profile)
        setLoading(false)
        setTimeout(() => setAnimated(true), 100)
      })
      .catch(() => setLoading(false))
  }, [businessId])

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="w-8 h-8 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin" />
    </div>
  )
  if (!profile) return null

  const cx = compact ? 100 : 150
  const cy = compact ? 100 : 150
  const maxR = compact ? 75 : 110
  const size = compact ? 200 : 300
  const n = AXES.length
  const scores = AXES.map(a => animated ? (profile[a.key as keyof RadarScore] as number || 0) : 0)
  const avgScores = AXES.map(a => INDUSTRY_AVG[a.key] || 60)
  const overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / n)

  const rings = [20, 40, 60, 80, 100]

  return (
    <div className={"w-full " + (compact ? "" : "p-4 rounded-2xl bg-surface-1 border border-white/[0.07]")}>
      {!compact && (
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs font-bold text-white/70">Yetkinlik Radarı</div>
            <div className="text-[10px] text-white/30 mt-0.5">Usta Güven Endeksi</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black text-white">{overallScore}</div>
            <div className="text-[10px] text-white/30">/ 100</div>
          </div>
        </div>
      )}

      <div className="flex flex-col items-center">
        <svg width={size} height={size} viewBox={"0 0 " + size + " " + size}>
          <defs>
            <radialGradient id={"rg-" + businessId} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Arka plan halkalari */}
          {rings.map(r => {
            const pts = AXES.map((_, i) => {
              const angle = (360 / n) * i
              const { x, y } = polarToXY(angle, (r / 100) * maxR, cx, cy)
              return x.toFixed(1) + ',' + y.toFixed(1)
            }).join(' ')
            return <polygon key={r} points={pts} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
          })}

          {/* Eksen cizgileri */}
          {AXES.map((axis, i) => {
            const angle = (360 / n) * i
            const { x, y } = polarToXY(angle, maxR, cx, cy)
            return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
          })}

          {/* Sektör ortalaması */}
          {showIndustryAvg && (
            <path
              d={buildPath(avgScores, cx, cy, maxR)}
              fill="rgba(255,255,255,0.03)"
              stroke="rgba(255,255,255,0.15)"
              strokeWidth="1"
              strokeDasharray="4 3"
            />
          )}

          {/* Ana radar alani */}
          <path
            d={buildPath(scores, cx, cy, maxR)}
            fill="url(#rg-" + businessId + ")"
            stroke="#6366f1"
            strokeWidth="2"
            style={{ transition: 'all 0.8s cubic-bezier(0.34,1.56,0.64,1)' }}
          />

          {/* Nokta isaretcileri */}
          {scores.map((s, i) => {
            const angle = (360 / n) * i
            const r = (s / 100) * maxR
            const { x, y } = polarToXY(angle, r, cx, cy)
            return (
              <circle key={i} cx={x} cy={y} r="4"
                fill={AXES[i].color} stroke="rgba(0,0,0,0.5)" strokeWidth="1.5"
                style={{ transition: 'all 0.8s cubic-bezier(0.34,1.56,0.64,1) ' + (i * 0.05) + 's' }}
              />
            )
          })}

          {/* Eksen etiketleri */}
          {AXES.map((axis, i) => {
            const angle = (360 / n) * i
            const { x, y } = polarToXY(angle, maxR + (compact ? 18 : 24), cx, cy)
            const score = scores[i]
            return (
              <g key={i}>
                <text x={x} y={y - 4} textAnchor="middle" fill="rgba(255,255,255,0.5)"
                  fontSize={compact ? "7" : "9"} fontWeight="600">
                  {axis.label}
                </text>
                <text x={x} y={y + (compact ? 8 : 10)} textAnchor="middle" fill={AXES[i].color}
                  fontSize={compact ? "9" : "11"} fontWeight="800">
                  {score}
                </text>
              </g>
            )
          })}
        </svg>

        {/* Alt bilgi */}
        {!compact && (
          <div className="w-full mt-2 space-y-1.5">
            {profile.sertifikalar && profile.sertifikalar.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {profile.sertifikalar.map((s: string) => (
                  <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">{s}</span>
                ))}
              </div>
            )}
            <div className="flex gap-3 text-[10px] text-white/30">
              {profile.ustaSicili && <span>⏱ {profile.ustaSicili} yıl deneyim</span>}
              {profile.liftSayisi && <span>🔧 {profile.liftSayisi} lift</span>}
              {profile.garantiSuresiAy && <span>🛡 {profile.garantiSuresiAy} ay garanti</span>}
              {profile.totalRatings && profile.totalRatings > 0 && <span>📊 {profile.totalRatings} değerlendirme</span>}
            </div>
            {showIndustryAvg && (
              <div className="flex items-center gap-1.5 text-[10px] text-white/25">
                <div className="w-4 h-px border-t border-dashed border-white/25" />
                <span>Sektör ortalaması</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
`

writeFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/components/business/YetkinlikRadari.tsx", component, "utf8")
console.log("YetkinlikRadari.tsx olusturuldu!")