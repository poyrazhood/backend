import { readFileSync, writeFileSync } from "fs"
let content = readFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/sahip-paneli/page.tsx", "utf8")

const form = `
function AutoServiceManualForm({ businessId }: { businessId: string }) {
  const [form, setForm] = useState({ ustaSicili: '', liftSayisi: '', garantiSuresiAy: '', scoreEkipman: '', scoreTecrube: '', sertifikalar: '', uzmanlikAlanlari: '' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\\/api$/, '')
  const getToken = () => localStorage.getItem('token') || ''

  const handleSave = async () => {
    setSaving(true)
    try {
      const body: any = {}
      if (form.ustaSicili) body.ustaSicili = parseInt(form.ustaSicili)
      if (form.liftSayisi) body.liftSayisi = parseInt(form.liftSayisi)
      if (form.garantiSuresiAy) body.garantiSuresiAy = parseInt(form.garantiSuresiAy)
      if (form.scoreEkipman) body.scoreEkipman = parseFloat(form.scoreEkipman)
      if (form.scoreTecrube) body.scoreTecrube = parseFloat(form.scoreTecrube)
      if (form.sertifikalar) body.sertifikalar = form.sertifikalar.split(',').map((s: string) => s.trim()).filter(Boolean)
      if (form.uzmanlikAlanlari) body.uzmanlikAlanlari = form.uzmanlikAlanlari.split(',').map((s: string) => s.trim()).filter(Boolean)
      await fetch(\`\${API}/api/auto-service/\${businessId}/manual\`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: \`Bearer \${getToken()}\` },
        body: JSON.stringify(body)
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally { setSaving(false) }
  }

  return (
    <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/[0.07]">
      <div className="text-xs font-bold text-white/70 mb-3">Yetkinlik Bilgilerini Guncelle</div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {[
          { key: 'ustaSicili', label: 'Deneyim (Yil)', placeholder: '12' },
          { key: 'liftSayisi', label: 'Lift Sayisi', placeholder: '3' },
          { key: 'garantiSuresiAy', label: 'Garanti (Ay)', placeholder: '6' },
          { key: 'scoreEkipman', label: 'Ekipman Skoru (0-100)', placeholder: '78' },
          { key: 'scoreTecrube', label: 'Tecrube Skoru (0-100)', placeholder: '85' },
        ].map(({ key, label, placeholder }) => (
          <div key={key}>
            <div className="text-[10px] text-white/40 mb-1">{label}</div>
            <input type="number" placeholder={placeholder} value={(form as any)[key]}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-indigo-500/50" />
          </div>
        ))}
      </div>
      <div className="space-y-2 mb-3">
        <div>
          <div className="text-[10px] text-white/40 mb-1">Sertifikalar (virgille ayirin)</div>
          <input type="text" placeholder="Bosch Servis, ASE Sertifikali" value={form.sertifikalar}
            onChange={e => setForm(f => ({ ...f, sertifikalar: e.target.value }))}
            className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-indigo-500/50" />
        </div>
        <div>
          <div className="text-[10px] text-white/40 mb-1">Uzmanlik Alanlari (virgille ayirin)</div>
          <input type="text" placeholder="Motor, Fren, Elektrik" value={form.uzmanlikAlanlari}
            onChange={e => setForm(f => ({ ...f, uzmanlikAlanlari: e.target.value }))}
            className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-indigo-500/50" />
        </div>
      </div>
      <button onClick={handleSave} disabled={saving}
        className="w-full py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white text-xs font-bold transition-all">
        {saving ? 'Kaydediliyor...' : saved ? 'Kaydedildi!' : 'Kaydet'}
      </button>
    </div>
  )
}
`

// ReviewsTab'dan once ekle
content = content.replace("function ReviewsTab", form + "\nfunction ReviewsTab")

writeFileSync("C:/Users/PC/Desktop/tecrubelerim-frontend/app/sahip-paneli/page.tsx", content, "utf8")
console.log("AutoServiceManualForm eklendi!")