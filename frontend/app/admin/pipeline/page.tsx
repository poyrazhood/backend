'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Activity, Play, Square, RefreshCw, ChevronLeft, Loader2,
  Cpu, MemoryStick, AlertTriangle, CheckCircle, Clock,
  Zap, Terminal, Trash2, XCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'

const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/\/api\/?$/, '')
const getH = () => ({ 'x-admin-secret': 'tecrube_admin_2026', 'Content-Type': 'application/json' })

const AUTO_REFRESH_MS = 10 * 60 * 1000 // 10 dakika

interface PipelineStatus {
  key: string
  name: string
  icon: string
  description: string
  color: string
  status: 'RUNNING' | 'IDLE' | 'FAILED'
  pid: number | null
  lastActivity: string | null
  logSize: string
  errorCount: number
  processed: number | null
  speed: number | null
  remaining: number | null
  lastLog: string
}

interface SystemInfo {
  loadAvg: number
  loadAvg5: number
  totalMemMB: number
  usedMemMB: number
  freeMemMB: number
  chromeProcesses: number
}

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  indigo:  { bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20',  text: 'text-indigo-400',  badge: 'bg-indigo-500' },
  purple:  { bg: 'bg-purple-500/10',  border: 'border-purple-500/20',  text: 'text-purple-400',  badge: 'bg-purple-500' },
  blue:    { bg: 'bg-blue-500/10',    border: 'border-blue-500/20',    text: 'text-blue-400',    badge: 'bg-blue-500' },
  emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', badge: 'bg-emerald-500' },
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'RUNNING') return (
    <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
      ÇALIŞIYOR
    </span>
  )
  if (status === 'FAILED') return (
    <span className="flex items-center gap-1.5 text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-full">
      <XCircle size={11} />
      HATA
    </span>
  )
  return (
    <span className="flex items-center gap-1.5 text-xs font-bold text-white/40 bg-white/[0.05] border border-white/[0.08] px-2.5 py-1 rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
      BEKLIYOR
    </span>
  )
}

function StatBox({ label, value, sub, color = 'white' }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3 text-center">
      <div className={cn('text-lg font-black',
        color === 'emerald' ? 'text-emerald-400' :
        color === 'red' ? 'text-red-400' :
        color === 'amber' ? 'text-amber-400' : 'text-white'
      )}>{value ?? '—'}</div>
      <div className="text-[10px] text-white/40 mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-white/25 mt-0.5">{sub}</div>}
    </div>
  )
}

function LogViewer({ log }: { log: string }) {
  const [open, setOpen] = useState(false)
  if (!log) return null
  return (
    <div className="mt-3">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors">
        <Terminal size={11} />
        {open ? 'Logu Gizle' : 'Son Logları Göster'}
      </button>
      {open && (
        <pre className="mt-2 p-3 rounded-xl bg-black/40 border border-white/[0.06] text-[10px] text-white/50 font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
          {log || 'Log yok'}
        </pre>
      )}
    </div>
  )
}

export default function AdminPipelinePage() {
  const [pipelines, setPipelines] = useState<PipelineStatus[]>([])
  const [system, setSystem] = useState<SystemInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [countdown, setCountdown] = useState(AUTO_REFRESH_MS / 1000)
  const [killLoading, setKillLoading] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const countdownRef = useRef<NodeJS.Timeout | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/admin/pipeline/status`, { headers: getH() })
      if (!res.ok) return
      const d = await res.json()
      setPipelines(d.pipelines || [])
      setSystem(d.system || null)
      setLastRefresh(new Date())
      setCountdown(AUTO_REFRESH_MS / 1000)
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchStatus()
    // 10 dakikada bir otomatik yenile
    intervalRef.current = setInterval(fetchStatus, AUTO_REFRESH_MS)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [fetchStatus])

  // Geri sayım
  useEffect(() => {
    countdownRef.current = setInterval(() => {
      setCountdown(c => c <= 1 ? AUTO_REFRESH_MS / 1000 : c - 1)
    }, 1000)
    return () => { if (countdownRef.current) clearInterval(countdownRef.current) }
  }, [])

  const handleManualRefresh = () => {
    setLoading(true)
    fetchStatus()
    setCountdown(AUTO_REFRESH_MS / 1000)
  }

  const handleAction = async (key: string, action: 'start' | 'stop') => {
    setActionLoading(key + action)
    try {
      const res = await fetch(`${API}/api/admin/pipeline/${key}/${action}`, {
        method: 'POST',
        headers: getH()
      })
      const d = await res.json()
      if (!res.ok) { alert(d.error || 'Islem basarisiz'); return }
      setTimeout(fetchStatus, 1500)
    } catch (e: any) { alert(e.message) }
    finally { setActionLoading(null) }
  }

  const handleKillChrome = async () => {
    setKillLoading(true)
    try {
      await fetch(`${API}/api/admin/pipeline/chrome/kill`, { method: 'POST', headers: getH() })
      setTimeout(fetchStatus, 2000)
    } catch {}
    finally { setKillLoading(false) }
  }

  const formatDate = (d: string | null) => {
    if (!d) return '—'
    return new Date(d).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  const formatCountdown = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const runningCount = pipelines.filter(p => p.status === 'RUNNING').length
  const memPercent = system ? Math.round((system.usedMemMB / system.totalMemMB) * 100) : 0
  const loadColor = system ? (system.loadAvg > 8 ? 'red' : system.loadAvg > 4 ? 'amber' : 'emerald') : 'white'

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <div className="border-b border-white/[0.07] px-6 py-4 flex items-center justify-between sticky top-0 bg-[#0a0a0f] z-10">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="w-8 h-8 rounded-lg bg-white/[0.05] flex items-center justify-center text-white/40 hover:text-white transition-colors">
            <ChevronLeft size={16} />
          </Link>
          <Activity size={18} className="text-indigo-400" />
          <span className="font-black text-lg">Pipeline Monitor</span>
          {runningCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 font-bold animate-pulse">
              {runningCount} aktif
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/25 font-mono">
            Yenileme: {formatCountdown(countdown)}
          </span>
          {lastRefresh && (
            <span className="text-xs text-white/25">
              {lastRefresh.toLocaleTimeString('tr-TR')}
            </span>
          )}
          <button onClick={handleManualRefresh} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.05] text-white/50 text-xs font-medium hover:text-white hover:bg-white/[0.08] transition-all disabled:opacity-30">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Yenile
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-6 space-y-6">

        {/* Sistem Durumu */}
        {system && (
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
            <div className="flex items-center gap-2 mb-4">
              <Cpu size={15} className="text-white/50" />
              <span className="font-bold text-sm text-white">Sistem Kaynakları</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <StatBox label="CPU Load (1dk)" value={system.loadAvg.toFixed(2)} color={loadColor} />
              <StatBox label="CPU Load (5dk)" value={system.loadAvg5.toFixed(2)} color={system.loadAvg5 > 8 ? 'red' : 'white'} />
              <StatBox label="RAM Kullanım" value={`${memPercent}%`} sub={`${system.usedMemMB} / ${system.totalMemMB} MB`} color={memPercent > 85 ? 'red' : memPercent > 70 ? 'amber' : 'emerald'} />
              <StatBox label="Boş RAM" value={`${system.freeMemMB} MB`} color={system.freeMemMB < 500 ? 'red' : 'white'} />
              <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3 text-center flex flex-col items-center justify-center gap-2">
                <div className={cn('text-lg font-black', system.chromeProcesses > 10 ? 'text-red-400' : system.chromeProcesses > 4 ? 'text-amber-400' : 'text-white')}>
                  {system.chromeProcesses}
                </div>
                <div className="text-[10px] text-white/40">Chrome Process</div>
                {system.chromeProcesses > 4 && (
                  <button onClick={handleKillChrome} disabled={killLoading}
                    className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-red-500/15 text-red-400 border border-red-500/20 hover:bg-red-500/25 transition-colors disabled:opacity-50">
                    {killLoading ? <Loader2 size={9} className="animate-spin" /> : <Trash2 size={9} />}
                    Temizle
                  </button>
                )}
              </div>
            </div>

            {/* Load bar */}
            <div className="mt-4">
              <div className="flex justify-between text-[10px] text-white/30 mb-1">
                <span>CPU Yükü (8 core)</span>
                <span>{system.loadAvg.toFixed(2)} / 8.00</span>
              </div>
              <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                <div className={cn('h-full rounded-full transition-all duration-700',
                  system.loadAvg > 8 ? 'bg-red-500' : system.loadAvg > 4 ? 'bg-amber-500' : 'bg-emerald-500'
                )} style={{ width: `${Math.min((system.loadAvg / 8) * 100, 100)}%` }} />
              </div>
            </div>

            {system.loadAvg > 8 && (
              <div className="mt-3 flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                <AlertTriangle size={13} />
                Sunucu aşırı yüklü! Yeni pipeline başlatmayın. Önce Chrome process'lerini temizleyin.
              </div>
            )}
          </div>
        )}

        {/* Pipeline Kartları */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-white/50 uppercase tracking-wider">Pipeline'lar</h2>

          {loading && pipelines.length === 0 ? (
            <div className="flex justify-center py-16">
              <Loader2 size={28} className="animate-spin text-white/20" />
            </div>
          ) : (
            pipelines.map(p => {
              const colors = COLOR_MAP[p.color] || COLOR_MAP.indigo
              const isRunning = p.status === 'RUNNING'
              const startingKey = p.key + 'start'
              const stoppingKey = p.key + 'stop'

              return (
                <div key={p.key} className={cn(
                  'rounded-2xl border p-5 transition-all',
                  isRunning ? `${colors.bg} ${colors.border}` : 'bg-white/[0.02] border-white/[0.07]'
                )}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0', colors.bg)}>
                        {p.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="font-bold text-white">{p.name}</span>
                          <StatusBadge status={p.status} />
                          {p.pid && <span className="text-[10px] text-white/25 font-mono">PID: {p.pid}</span>}
                        </div>
                        <p className="text-xs text-white/40 mb-3">{p.description}</p>

                        {/* İstatistikler */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <div className="bg-black/20 rounded-xl p-2.5 text-center">
                            <div className="text-sm font-black text-white">
                              {p.processed !== null ? p.processed.toLocaleString('tr-TR') : '—'}
                            </div>
                            <div className="text-[10px] text-white/30 mt-0.5">İşlenen</div>
                          </div>
                          <div className="bg-black/20 rounded-xl p-2.5 text-center">
                            <div className={cn('text-sm font-black', p.speed ? colors.text : 'text-white')}>
                              {p.speed !== null ? `${p.speed.toFixed(1)}/sn` : '—'}
                            </div>
                            <div className="text-[10px] text-white/30 mt-0.5">Hız</div>
                          </div>
                          <div className="bg-black/20 rounded-xl p-2.5 text-center">
                            <div className="text-sm font-black text-white">
                              {p.remaining !== null ? p.remaining.toLocaleString('tr-TR') : '—'}
                            </div>
                            <div className="text-[10px] text-white/30 mt-0.5">Kalan</div>
                          </div>
                          <div className="bg-black/20 rounded-xl p-2.5 text-center">
                            <div className={cn('text-sm font-black', p.errorCount > 10 ? 'text-red-400' : p.errorCount > 0 ? 'text-amber-400' : 'text-white')}>
                              {p.errorCount}
                            </div>
                            <div className="text-[10px] text-white/30 mt-0.5">Hata (log)</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 mt-2 text-[10px] text-white/25">
                          <span className="flex items-center gap-1">
                            <Clock size={9} />
                            Son aktivite: {formatDate(p.lastActivity)}
                          </span>
                          <span>Log: {p.logSize}</span>
                        </div>

                        <LogViewer log={p.lastLog} />
                      </div>
                    </div>

                    {/* Aksiyon butonu */}
                    <div className="flex-shrink-0">
                      {isRunning ? (
                        <button
                          onClick={() => handleAction(p.key, 'stop')}
                          disabled={actionLoading === stoppingKey}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/15 text-red-400 border border-red-500/20 text-xs font-bold hover:bg-red-500/25 transition-all disabled:opacity-50"
                        >
                          {actionLoading === stoppingKey
                            ? <Loader2 size={13} className="animate-spin" />
                            : <Square size={13} />}
                          Durdur
                        </button>
                      ) : (
                        <button
                          onClick={() => handleAction(p.key, 'start')}
                          disabled={actionLoading === startingKey || (system?.loadAvg ?? 0) > 12}
                          className={cn(
                            'flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50',
                            colors.bg, colors.text, colors.border, 'border hover:opacity-80'
                          )}
                        >
                          {actionLoading === startingKey
                            ? <Loader2 size={13} className="animate-spin" />
                            : <Play size={13} />}
                          Başlat
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Hızlı Rehber */}
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={14} className="text-amber-400" />
            <span className="font-bold text-sm text-white">Pipeline Sırası</span>
          </div>
          <div className="space-y-2 text-xs text-white/50">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px] font-black flex-shrink-0">1</span>
              <span><strong className="text-white">Review Scraper</strong> → Yorumları toplar (sürekli çalışır)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-[10px] font-black flex-shrink-0">2</span>
              <span><strong className="text-white">Review Embedding</strong> → Toplanan yorumları vektöre çevirir</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px] font-black flex-shrink-0">3</span>
              <span><strong className="text-white">Business Embedding</strong> → İşletmeleri vektöre çevirir</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-black flex-shrink-0">4</span>
              <span><strong className="text-white">AI Zenginleştirme</strong> → Soru-cevap üretir (en son çalıştırın)</span>
            </div>
          </div>
          <div className="mt-3 text-[10px] text-white/25 bg-amber-500/5 border border-amber-500/15 rounded-xl px-3 py-2">
            ⚠ Embedding pipeline'ları aynı anda çalıştırmayın — Ollama aynı anda tek model çalıştırabilir.
          </div>
        </div>

      </div>
    </div>
  )
}
