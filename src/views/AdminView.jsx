import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const KITCHEN_NAME  = 'Cocina + limpieza'
const KITCHEN_EMOJI = '🍳'
const KITCHEN_GOAL  = 5
const KITCHEN_BONUS = 50

// Lunes de la semana de una fecha, como YYYY-MM-DD
function getWeekStartStr(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d.toISOString().split('T')[0]
}

function getWeekBounds() {
  const monday = new Date(getWeekStartStr(new Date()) + 'T00:00:00')
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { monday, sunday }
}

function formatDateLong(str) {
  return new Date(str + 'T12:00:00').toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateShort(d) {
  return new Date(d).toISOString().split('T')[0]
}

function getDayLabel(dateStr) {
  const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  return days[new Date(dateStr + 'T12:00:00').getDay()]
}

// Agrupa entradas por nombre de actividad: { name, emoji, count, total }[]
function buildBreakdown(entries) {
  const map = {}
  entries.forEach(e => {
    if (!map[e.activity_name]) map[e.activity_name] = { name: e.activity_name, emoji: e.activity_emoji, count: 0, total: 0 }
    map[e.activity_name].count++
    map[e.activity_name].total += e.reward || 0
  })
  return Object.values(map).sort((a, b) => b.total - a.total)
}

const EMOJI_OPTIONS = ['🏠','🍳','🧹','💪','📚','🐾','🛍️','❤️','⭐','🌟','🎵','🎨','🧘','🏃','🌱','💊','🛁','🧺','🍽️','🐶']
const emptyForm = { name: '', emoji: '⭐', reward: '', note: '' }

export default function AdminView({ onExit }) {
  const [tab, setTab] = useState('stats')
  const [activities, setActivities] = useState([])
  const [paidWeeks, setPaidWeeks] = useState([])   // registros de la tabla weeks
  const [allEntries, setAllEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [deletingEntryId, setDeletingEntryId] = useState(null)
  const [showAllEntries, setShowAllEntries] = useState(false)
  const [addingKitchenDay, setAddingKitchenDay] = useState(false)
  const [expandedWeek, setExpandedWeek] = useState(null)   // week_start del desplegado
  const [payingWeek, setPayingWeek] = useState(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: acts }, { data: wks }, { data: entries }] = await Promise.all([
      supabase.from('activities').select('*').order('name'),
      supabase.from('weeks').select('*'),
      supabase.from('entries').select('*').order('logged_at', { ascending: false }),
    ])
    setActivities(acts || [])
    setPaidWeeks(wks || [])
    setAllEntries(entries || [])
    setLoading(false)
  }

  // ── Stats globales ───────────────────────────────────────────────────────
  const totalEarned = allEntries.reduce((s, e) => s + (e.reward || 0), 0)
  const topActivity = allEntries.reduce((acc, e) => {
    acc[e.activity_name] = (acc[e.activity_name] || 0) + 1
    return acc
  }, {})
  const topName = Object.entries(topActivity).sort((a, b) => b[1] - a[1])[0]

  // ── Bono cocina semana actual ────────────────────────────────────────────
  const { monday, sunday } = getWeekBounds()
  const weekKitchenEntries = allEntries.filter(e => {
    const d = new Date(e.logged_at)
    return d >= monday && d <= sunday && e.activity_name === KITCHEN_NAME && e.reward === 0
  })
  const weekKitchenDays    = weekKitchenEntries.length
  const weekKitchenClaimed = allEntries.some(e => {
    const d = new Date(e.logged_at)
    return d >= monday && d <= sunday && e.activity_name === KITCHEN_NAME && e.reward === KITCHEN_BONUS
  })

  async function addKitchenDayManual() {
    setAddingKitchenDay(true)
    await supabase.from('entries').insert({
      activity_id: null, activity_name: KITCHEN_NAME,
      activity_emoji: KITCHEN_EMOJI, reward: 0,
      logged_at: new Date().toISOString(),
    })
    await loadAll()
    setAddingKitchenDay(false)
  }

  // ── Semanas agrupadas desde entries ─────────────────────────────────────
  // Cada entrada → su lunes de semana; agrupar por ese lunes
  const weekGroupsMap = {}
  allEntries.forEach(e => {
    const ws = getWeekStartStr(new Date(e.logged_at))
    if (!weekGroupsMap[ws]) weekGroupsMap[ws] = []
    weekGroupsMap[ws].push(e)
  })
  // Ordenar semanas de más reciente a más antigua
  const sortedWeekStarts = Object.keys(weekGroupsMap).sort().reverse()

  // Lookup de semanas pagadas por week_start
  const paidMap = {}
  paidWeeks.forEach(w => { paidMap[w.week_start] = w })

  async function markPaid(weekStart) {
    setPayingWeek(weekStart)
    // Upsert: crea si no existe, actualiza si existe
    await supabase.from('weeks').upsert(
      { week_start: weekStart, paid: true, paid_at: new Date().toISOString() },
      { onConflict: 'week_start' }
    )
    await loadAll()
    setPayingWeek(null)
  }

  // ── CRUD actividades ─────────────────────────────────────────────────────
  async function saveActivity() {
    if (!form.name.trim() || !form.reward) return
    setSaving(true)
    const data = {
      name: form.name.trim(), emoji: form.emoji,
      reward: parseFloat(form.reward), note: form.note.trim() || null, active: true,
    }
    if (editingId) await supabase.from('activities').update(data).eq('id', editingId)
    else await supabase.from('activities').insert(data)
    setForm(emptyForm); setEditingId(null); setShowForm(false)
    await loadAll()
    setSaving(false)
  }

  async function toggleActive(act) {
    await supabase.from('activities').update({ active: !act.active }).eq('id', act.id)
    await loadAll()
  }

  async function deleteActivity(id) {
    if (!confirm('¿Eliminar esta actividad? No se borrarán los registros existentes.')) return
    await supabase.from('activities').delete().eq('id', id)
    await loadAll()
  }

  async function deleteEntry(entryId) {
    if (!confirm('¿Eliminar esta entrada?')) return
    setDeletingEntryId(entryId)
    await supabase.from('entries').delete().eq('id', entryId)
    await loadAll()
    setDeletingEntryId(null)
  }

  function startEdit(act) {
    setForm({ name: act.name, emoji: act.emoji, reward: String(act.reward), note: act.note || '' })
    setEditingId(act.id)
    setShowForm(true)
  }

  function cancelForm() {
    setForm(emptyForm); setEditingId(null); setShowForm(false)
  }

  const visibleEntries = showAllEntries ? allEntries : allEntries.slice(0, 10)

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24">
      {/* Header */}
      <header className="bg-white px-5 pt-5 pb-4 sticky top-0 z-10 border-b border-[#E2E8F0]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Admin</h1>
            <p className="text-xs text-gray-400">Panel de control</p>
          </div>
          <button onClick={onExit} className="text-sm text-gray-500 bg-[#F0FDFA] rounded-full px-3 py-1 active:bg-tikky-lavender">
            ← Salir
          </button>
        </div>
        <div className="flex gap-1 mt-3 bg-[#F0FDFA] rounded-xl p-1">
          {[
            { id: 'stats',      label: 'Stats' },
            { id: 'weeks',      label: 'Semanas' },
            { id: 'activities', label: 'Actividades' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-all ${
                tab === t.id ? 'bg-white text-tikky-pink shadow-sm' : 'text-gray-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="px-4 pt-4 space-y-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-tikky-pink border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* ── STATS ── */}
            {tab === 'stats' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <StatCard emoji="💰" label="Total ganado"  value={`${totalEarned.toFixed(2)}€`} />
                  <StatCard emoji="📋" label="Registros"     value={allEntries.length} />
                  <StatCard emoji="📅" label="Semanas"       value={sortedWeekStarts.length} />
                  <StatCard emoji="✅" label="Activas"       value={activities.filter(a => a.active).length} />
                </div>

                {topName && (
                  <div className="bg-white rounded-2xl p-4 border border-[#E2E8F0]">
                    <p className="text-xs text-gray-400 mb-1">Actividad más repetida</p>
                    <p className="font-semibold text-gray-800">{topName[0]}</p>
                    <p className="text-sm text-tikky-pink font-medium">{topName[1]} veces</p>
                  </div>
                )}

                {/* Bono cocina esta semana */}
                <div className="bg-white rounded-2xl p-4 border border-[#E2E8F0]">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{KITCHEN_EMOJI}</span>
                      <div>
                        <p className="text-sm font-semibold text-gray-800">Cocina esta semana</p>
                        <p className="text-xs text-gray-400">
                          {weekKitchenDays} / {KITCHEN_GOAL} días{weekKitchenClaimed ? ' · ✅ Bono cobrado' : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="h-1.5 bg-tikky-lavender rounded-full overflow-hidden mb-3">
                    <div
                      className="h-full bg-tikky-pink rounded-full transition-all duration-500"
                      style={{ width: `${Math.min((weekKitchenDays / KITCHEN_GOAL) * 100, 100)}%` }}
                    />
                  </div>
                  {!weekKitchenClaimed && (
                    <button
                      onClick={addKitchenDayManual}
                      disabled={addingKitchenDay || weekKitchenDays >= KITCHEN_GOAL}
                      className={`w-full py-2.5 rounded-xl text-sm font-medium transition-colors ${
                        weekKitchenDays >= KITCHEN_GOAL
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-[#F0FDFA] border border-tikky-lavender text-tikky-pink active:bg-tikky-lavender'
                      }`}
                    >
                      {addingKitchenDay ? '⏳ Añadiendo...' : '+ Añadir día cocina'}
                    </button>
                  )}
                </div>

                {/* Historial completo */}
                <div className="bg-white rounded-2xl p-4 border border-[#E2E8F0]">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Historial</h3>
                    <button onClick={() => setShowAllEntries(v => !v)} className="text-xs text-tikky-pink font-medium">
                      {showAllEntries ? 'Ocultar' : `Ver todo (${allEntries.length})`}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {visibleEntries.map((e, i) => {
                      const date    = new Date(e.logged_at)
                      const dateKey = formatDateShort(date)
                      return (
                        <div key={e.id || i} className="flex items-center gap-2">
                          <span className="text-base">{e.activity_emoji}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-800 truncate">{e.activity_name}</p>
                            <p className="text-xs text-gray-400">
                              {getDayLabel(dateKey)} {date.toLocaleDateString('es', { day: '2-digit', month: 'short' })} · {date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          <span className="text-tikky-pink font-semibold text-sm">
                            {e.reward > 0 ? `+${e.reward}€` : <span className="text-gray-300">—</span>}
                          </span>
                          <button
                            onClick={() => deleteEntry(e.id)}
                            disabled={deletingEntryId === e.id}
                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-50 text-red-400 active:bg-red-100 text-xs flex-shrink-0"
                          >
                            {deletingEntryId === e.id ? '…' : '✕'}
                          </button>
                        </div>
                      )
                    })}
                    {allEntries.length === 0 && (
                      <p className="text-sm text-gray-400 text-center py-2">Sin registros</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── SEMANAS ── */}
            {tab === 'weeks' && (
              <div className="space-y-3">
                {sortedWeekStarts.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-8">No hay entradas registradas</p>
                )}
                {sortedWeekStarts.map(ws => {
                  const entries     = weekGroupsMap[ws]
                  const weekTotal   = entries.reduce((s, e) => s + (e.reward || 0), 0)
                  const paid        = paidMap[ws]?.paid === true
                  const paidAt      = paidMap[ws]?.paid_at
                  const breakdown   = buildBreakdown(entries)
                  const isExpanded  = expandedWeek === ws
                  const isCurrentWk = ws === getWeekStartStr(new Date())

                  // Fecha fin de semana (domingo)
                  const wkSunday = new Date(ws + 'T00:00:00')
                  wkSunday.setDate(wkSunday.getDate() + 6)
                  const wkSundayStr = formatDateShort(wkSunday)

                  return (
                    <div key={ws} className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden">
                      {/* Cabecera de la semana */}
                      <button
                        className="w-full px-4 py-3 flex items-center gap-3 text-left active:bg-[#F0FDFA]"
                        onClick={() => setExpandedWeek(isExpanded ? null : ws)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-gray-800">
                              {formatDateLong(ws)}
                              {isCurrentWk && (
                                <span className="ml-2 text-[10px] bg-tikky-lavender text-tikky-pink rounded-full px-2 py-0.5 font-medium">
                                  actual
                                </span>
                              )}
                            </p>
                          </div>
                          <p className="text-xs text-gray-400">{ws} → {wkSundayStr}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-tikky-pink font-bold text-sm">{weekTotal.toFixed(2)}€</p>
                          <p className="text-xs text-gray-400">{entries.length} registro{entries.length !== 1 ? 's' : ''}</p>
                        </div>
                        <span className="text-gray-300 text-xs ml-1">{isExpanded ? '▲' : '▼'}</span>
                      </button>

                      {/* Desglose + acción pago */}
                      {isExpanded && (
                        <div className="border-t border-[#E2E8F0] px-4 py-3 space-y-3">
                          {/* Desglose por actividad */}
                          <div className="space-y-1.5">
                            {breakdown.map(b => (
                              <div key={b.name} className="flex items-center gap-2">
                                <span className="text-sm">{b.emoji}</span>
                                <span className="flex-1 text-xs text-gray-600 truncate">{b.name}</span>
                                <span className="text-xs text-gray-400">×{b.count}</span>
                                {b.total > 0
                                  ? <span className="text-xs font-semibold text-tikky-pink">{b.total.toFixed(2)}€</span>
                                  : <span className="text-xs text-gray-300">—</span>
                                }
                              </div>
                            ))}
                          </div>

                          {/* Estado de pago */}
                          {paid ? (
                            <div className="flex items-center justify-between bg-[#F0FDFA] rounded-xl px-3 py-2">
                              <span className="text-xs text-tikky-pink font-medium">✅ Pagado</span>
                              {paidAt && (
                                <span className="text-xs text-gray-400">
                                  {new Date(paidAt).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </span>
                              )}
                            </div>
                          ) : (
                            <button
                              onClick={() => markPaid(ws)}
                              disabled={payingWeek === ws}
                              className="w-full bg-tikky-pink text-white text-sm font-semibold py-2.5 rounded-xl active:opacity-80"
                            >
                              {payingWeek === ws ? '⏳ Guardando...' : `Marcar como pagada — ${weekTotal.toFixed(2)}€`}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── ACTIVIDADES ── */}
            {tab === 'activities' && (
              <div className="space-y-3">
                {!showForm && (
                  <button onClick={() => setShowForm(true)} className="w-full bg-tikky-pink text-white font-semibold py-3 rounded-2xl active:opacity-80">
                    + Nueva actividad
                  </button>
                )}

                {showForm && (
                  <div className="bg-white rounded-2xl p-4 border border-[#E2E8F0] space-y-3">
                    <h3 className="font-semibold text-gray-800">{editingId ? 'Editar actividad' : 'Nueva actividad'}</h3>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Emoji</p>
                      <div className="flex flex-wrap gap-2">
                        {EMOJI_OPTIONS.map(e => (
                          <button
                            key={e}
                            onClick={() => setForm(f => ({ ...f, emoji: e }))}
                            className={`text-xl w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                              form.emoji === e ? 'bg-tikky-lavender ring-2 ring-tikky-pink' : 'bg-[#F0FDFA]'
                            }`}
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Nombre</p>
                      <input
                        className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tikky-pink"
                        placeholder="Ej: Cocinar la cena"
                        value={form.name}
                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Recompensa (€)</p>
                      <input
                        className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tikky-pink"
                        placeholder="Ej: 5" type="number" step="0.5" min="0"
                        value={form.reward}
                        onChange={e => setForm(f => ({ ...f, reward: e.target.value }))}
                      />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Nota (opcional)</p>
                      <input
                        className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tikky-pink"
                        placeholder="Descripción breve"
                        value={form.note}
                        onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={cancelForm} className="flex-1 border border-[#E2E8F0] text-gray-600 py-2 rounded-xl text-sm">Cancelar</button>
                      <button
                        onClick={saveActivity}
                        disabled={saving}
                        className="flex-1 bg-tikky-pink text-white py-2 rounded-xl text-sm font-medium active:opacity-80"
                      >
                        {saving ? '...' : editingId ? 'Guardar' : 'Añadir'}
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  {activities.map(act => (
                    <div key={act.id} className={`bg-white rounded-2xl px-4 py-3 border border-[#E2E8F0] ${!act.active ? 'opacity-50' : ''}`}>
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{act.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800 text-sm">{act.name}</p>
                          <p className="text-tikky-pink text-xs font-semibold">{act.reward}€</p>
                          {act.note && <p className="text-xs text-gray-400 truncate">{act.note}</p>}
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => startEdit(act)} className="w-8 h-8 rounded-lg bg-[#F0FDFA] flex items-center justify-center text-sm active:bg-tikky-lavender">✏️</button>
                          <button
                            onClick={() => toggleActive(act)}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm active:opacity-70 ${act.active ? 'bg-tikky-soft' : 'bg-[#F8FAFC]'}`}
                          >
                            {act.active ? '✅' : '⬜'}
                          </button>
                          <button onClick={() => deleteActivity(act.id)} className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-sm active:bg-red-100">🗑️</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function StatCard({ emoji, label, value }) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-[#E2E8F0]">
      <p className="text-2xl mb-1">{emoji}</p>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-lg font-bold text-gray-800">{value}</p>
    </div>
  )
}
