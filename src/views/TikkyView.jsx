import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function getWeekBounds() {
  const now = new Date()
  const day = now.getDay()
  const diffToMonday = (day === 0 ? -6 : 1 - day)
  const monday = new Date(now)
  monday.setDate(now.getDate() + diffToMonday)
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { monday, sunday }
}

function formatDate(d) {
  return d.toISOString().split('T')[0]
}

function getDayLabel(dateStr) {
  const days = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
  const d = new Date(dateStr + 'T12:00:00')
  return days[d.getDay()]
}

const MOTIVATIONAL = [
  { min: 0,   max: 20,  msg: '¡Empieza la semana con energía! 💪' },
  { min: 20,  max: 50,  msg: '¡Buen ritmo, sigue así! 🚀' },
  { min: 50,  max: 100, msg: '¡A mitad de camino, increíble! ✨' },
  { min: 100, max: 150, msg: '¡Estás siendo una crack! 🔥' },
  { min: 150, max: 999, msg: '¡Semana épica, eres la mejor! 🏆' },
]

const BADGES = [
  { id: 'first',   emoji: '🌱', label: 'Primera actividad',         check: (e) => e.length >= 1 },
  { id: 'five',    emoji: '⭐', label: '5 actividades',             check: (e) => e.length >= 5 },
  { id: 'ten',     emoji: '🔟', label: '10 actividades',            check: (e) => e.length >= 10 },
  { id: 'fifty',   emoji: '💰', label: '50€ en la semana',          check: (_, t) => t >= 50 },
  { id: 'hundred', emoji: '💎', label: '100€ histórico',            check: (_, __, tot) => tot >= 100 },
  { id: 'streak3', emoji: '🔥', label: '3 días seguidos',           check: (e) => checkStreak(e, 3) },
  { id: 'kitchen', emoji: '🍳', label: 'Bono cocina+limpieza',      check: (e) => e.some(x => x.activity_name?.toLowerCase().includes('cocina') || x.activity_name?.toLowerCase().includes('limpieza')) },
  { id: 'morning', emoji: '🌅', label: 'Actividad antes de las 9h', check: (e) => e.some(x => new Date(x.logged_at).getHours() < 9) },
  { id: 'weekend', emoji: '🎉', label: 'Activa el fin de semana',   check: (e) => e.some(x => { const d = new Date(x.logged_at).getDay(); return d === 0 || d === 6 }) },
]

function checkStreak(entries, n) {
  const days = [...new Set(entries.map(e => formatDate(new Date(e.logged_at))))].sort()
  if (days.length < n) return false
  let streak = 1
  for (let i = 1; i < days.length; i++) {
    const diff = (new Date(days[i]) - new Date(days[i-1])) / 86400000
    streak = diff === 1 ? streak + 1 : 1
    if (streak >= n) return true
  }
  return false
}

export default function TikkyView({ onAdminPress }) {
  const [activities, setActivities] = useState([])
  const [weekEntries, setWeekEntries] = useState([])
  const [allEntries, setAllEntries] = useState([])
  const [kitchenDays, setKitchenDays] = useState(0)
  const [loading, setLoading] = useState(true)
  const [logging, setLogging] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [showHistory, setShowHistory] = useState(false)
  const [dupModal, setDupModal] = useState(null) // actividad pendiente de confirmar

  const { monday, sunday } = getWeekBounds()

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: acts }, { data: weekE }, { data: allE }] = await Promise.all([
      supabase.from('activities').select('*').eq('active', true).order('name'),
      supabase.from('entries')
        .select('*')
        .gte('logged_at', monday.toISOString())
        .lte('logged_at', sunday.toISOString())
        .order('logged_at', { ascending: false }),
      supabase.from('entries').select('*').order('logged_at', { ascending: false }),
    ])
    setActivities(acts || [])
    setWeekEntries(weekE || [])
    setAllEntries(allE || [])

    const kitchenSet = new Set((allE || []).filter(e => e.activity_name?.toLowerCase().includes('cocina')).map(e => formatDate(new Date(e.logged_at))))
    const cleanSet   = new Set((allE || []).filter(e => e.activity_name?.toLowerCase().includes('limpieza')).map(e => formatDate(new Date(e.logged_at))))
    setKitchenDays([...kitchenSet].filter(d => cleanSet.has(d)).length)
    setLoading(false)
  }

  async function doLog(activity) {
    setLogging(activity.id)
    await supabase.from('entries').insert({
      activity_id: activity.id,
      activity_name: activity.name,
      activity_emoji: activity.emoji,
      reward: activity.reward,
      logged_at: new Date().toISOString(),
    })
    await loadAll()
    setLogging(null)
  }

  async function logActivity(activity) {
    if (logging) return
    // Comprobar duplicado en las últimas 24 horas
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: existing } = await supabase
      .from('entries')
      .select('id')
      .eq('activity_id', activity.id)
      .gte('logged_at', since)
      .limit(1)

    if (existing && existing.length > 0) {
      setDupModal(activity)
    } else {
      await doLog(activity)
    }
  }

  async function confirmDup() {
    const act = dupModal
    setDupModal(null)
    await doLog(act)
  }

  async function deleteEntry(entryId) {
    if (!confirm('¿Eliminar esta entrada?')) return
    setDeletingId(entryId)
    await supabase.from('entries').delete().eq('id', entryId)
    await loadAll()
    setDeletingId(null)
  }

  const weekTotal = weekEntries.reduce((s, e) => s + (e.reward || 0), 0)
  const allTotal  = allEntries.reduce((s, e) => s + (e.reward || 0), 0)

  const dailyData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const key = formatDate(d)
    const total = weekEntries.filter(e => formatDate(new Date(e.logged_at)) === key).reduce((s, e) => s + (e.reward || 0), 0)
    return { label: getDayLabel(key), value: total, key }
  })
  const maxDay = Math.max(...dailyData.map(d => d.value), 1)

  const motiv = MOTIVATIONAL.find(m => weekTotal >= m.min && weekTotal < m.max) || MOTIVATIONAL[MOTIVATIONAL.length - 1]
  const earnedBadges = BADGES.filter(b => b.check(weekEntries, weekTotal, allTotal))

  const bonusGoal = 7
  const bonusPct  = Math.min((kitchenDays / bonusGoal) * 100, 100)

  const todayKey = formatDate(new Date())
  const todayEntryNames = weekEntries.filter(e => formatDate(new Date(e.logged_at)) === todayKey).map(e => e.activity_name)
  const pendingToday = activities.filter(a => !todayEntryNames.includes(a.name))

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24">

      {/* Modal duplicado */}
      {dupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-xl">
            <p className="text-2xl text-center mb-3">⚠️</p>
            <h3 className="font-semibold text-gray-800 text-center mb-2">Actividad duplicada</h3>
            <p className="text-sm text-gray-500 text-center mb-6">
              Ya registraste <span className="font-medium text-gray-700">"{dupModal.name}"</span> en las últimas 24 horas. ¿Quieres añadirla de nuevo?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDupModal(null)}
                className="flex-1 border border-[#E2E8F0] text-gray-600 py-2.5 rounded-2xl text-sm font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDup}
                className="flex-1 bg-tikky-pink text-white py-2.5 rounded-2xl text-sm font-medium"
              >
                Sí, añadir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white px-5 pt-5 pb-4 sticky top-0 z-10 border-b border-[#E2E8F0]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Tikky Rewards 🎀</h1>
            <p className="text-xs text-gray-400">Sem. {formatDate(monday)} – {formatDate(sunday)}</p>
          </div>
          <button
            onClick={onAdminPress}
            className="w-9 h-9 rounded-full bg-[#F0FDFA] flex items-center justify-center text-tikky-pink active:bg-tikky-lavender"
          >
            ⚙️
          </button>
        </div>
      </header>

      <div className="px-4 pt-4 space-y-4">

        {/* Total semanal */}
        <div className="bg-gradient-to-br from-tikky-pink to-tikky-rose rounded-3xl p-5 text-white shadow-md">
          <p className="text-sm opacity-80 mb-1">Esta semana</p>
          <p className="text-5xl font-bold tracking-tight">{weekTotal.toFixed(2)}€</p>
          <p className="text-sm opacity-80 mt-1">{motiv.msg}</p>
          {pendingToday.length > 0 && (
            <div className="mt-3 inline-flex items-center gap-1 bg-white/20 rounded-full px-3 py-1 text-xs">
              ⏳ {pendingToday.length} pendiente{pendingToday.length > 1 ? 's' : ''} hoy
            </div>
          )}
        </div>

        {/* Actividades */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 px-1">Actividades</h2>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-tikky-pink border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-2">
              {activities.map((act) => (
                <button
                  key={act.id}
                  onClick={() => logActivity(act)}
                  disabled={!!logging}
                  className="w-full bg-white rounded-2xl px-4 py-3 flex items-center gap-3 border border-[#E2E8F0] active:scale-[0.98] transition-transform text-left"
                >
                  <span className="text-2xl">{act.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 text-sm leading-tight">{act.name}</p>
                    {act.note && <p className="text-xs text-gray-400 truncate">{act.note}</p>}
                  </div>
                  <span className="text-tikky-pink font-semibold text-sm whitespace-nowrap">
                    {logging === act.id ? '⏳' : `+${act.reward}€`}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Bono cocina + limpieza */}
        <section className="bg-white rounded-2xl p-4 border border-[#E2E8F0]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">🍳</span>
              <div>
                <p className="text-sm font-semibold text-gray-800">Bono Cocina + Limpieza</p>
                <p className="text-xs text-gray-400">{kitchenDays} de {bonusGoal} días completados</p>
              </div>
            </div>
            <span className="text-tikky-pink font-bold text-sm">🏅</span>
          </div>
          <div className="h-2 bg-tikky-lavender rounded-full overflow-hidden">
            <div
              className="h-full bg-tikky-pink rounded-full transition-all duration-500"
              style={{ width: `${bonusPct}%` }}
            />
          </div>
          {kitchenDays >= bonusGoal && (
            <p className="text-xs text-tikky-pink font-medium mt-2 text-center">🎉 ¡Bono completado! Habla con tu pareja 😏</p>
          )}
        </section>

        {/* Gráfica diaria */}
        <section className="bg-white rounded-2xl p-4 border border-[#E2E8F0]">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Esta semana</h2>
          <div className="flex items-end gap-1 h-20">
            {dailyData.map((d) => {
              const isToday = d.key === todayKey
              const pct = (d.value / maxDay) * 100
              return (
                <div key={d.key} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex items-end justify-center" style={{ height: 64 }}>
                    <div
                      className={`w-full rounded-t-lg transition-all duration-500 ${
                        isToday ? 'bg-tikky-pink' : d.value > 0 ? 'bg-tikky-lavender' : 'bg-[#E2E8F0]'
                      }`}
                      style={{ height: `${Math.max(pct, d.value > 0 ? 8 : 4)}%` }}
                    />
                  </div>
                  <span className={`text-[10px] font-medium ${isToday ? 'text-tikky-pink' : 'text-gray-400'}`}>
                    {d.label}
                  </span>
                </div>
              )
            })}
          </div>
        </section>

        {/* Insignias */}
        <section className="bg-white rounded-2xl p-4 border border-[#E2E8F0]">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Insignias</h2>
          <div className="grid grid-cols-3 gap-2">
            {BADGES.map((badge) => {
              const earned = earnedBadges.some(b => b.id === badge.id)
              return (
                <div
                  key={badge.id}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl ${earned ? 'bg-tikky-soft' : 'opacity-30'}`}
                >
                  <span className="text-2xl">{badge.emoji}</span>
                  <span className="text-[10px] text-center text-gray-600 leading-tight">{badge.label}</span>
                </div>
              )
            })}
          </div>
        </section>

        {/* Historial reciente */}
        <section className="bg-white rounded-2xl p-4 border border-[#E2E8F0]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Historial reciente</h2>
            <button onClick={() => setShowHistory(h => !h)} className="text-xs text-tikky-pink font-medium">
              {showHistory ? 'Ocultar' : 'Ver todo'}
            </button>
          </div>
          <div className="space-y-2">
            {(showHistory ? weekEntries : weekEntries.slice(0, 5)).map((e, i) => {
              const date = new Date(e.logged_at)
              return (
                <div key={e.id || i} className="flex items-center gap-3">
                  <span className="text-lg">{e.activity_emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate">{e.activity_name}</p>
                    <p className="text-xs text-gray-400">
                      {getDayLabel(formatDate(date))} {date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <span className="text-tikky-pink font-semibold text-sm">+{e.reward}€</span>
                  <button
                    onClick={() => deleteEntry(e.id)}
                    disabled={deletingId === e.id}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-50 text-red-400 active:bg-red-100 text-xs flex-shrink-0"
                  >
                    {deletingId === e.id ? '…' : '✕'}
                  </button>
                </div>
              )
            })}
            {weekEntries.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-2">Sin actividades esta semana</p>
            )}
          </div>
        </section>

      </div>
    </div>
  )
}
