import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function formatDate(d) {
  return new Date(d).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateShort(d) {
  return new Date(d).toISOString().split('T')[0]
}

function getDayLabel(dateStr) {
  const days = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
  const d = new Date(dateStr + 'T12:00:00')
  return days[d.getDay()]
}

const EMOJI_OPTIONS = ['🏠','🍳','🧹','💪','📚','🐾','🛍️','❤️','⭐','🌟','🎵','🎨','🧘','🏃','🌱','💊','🛁','🧺','🍽️','🐶']
const emptyForm = { name: '', emoji: '⭐', reward: '', note: '' }

export default function AdminView({ onExit }) {
  const [tab, setTab] = useState('stats')
  const [activities, setActivities] = useState([])
  const [weeks, setWeeks] = useState([])
  const [allEntries, setAllEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [payingId, setPayingId] = useState(null)
  const [deletingEntryId, setDeletingEntryId] = useState(null)
  const [showAllEntries, setShowAllEntries] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: acts }, { data: wks }, { data: entries }] = await Promise.all([
      supabase.from('activities').select('*').order('name'),
      supabase.from('weeks').select('*').order('week_start', { ascending: false }),
      supabase.from('entries').select('*').order('logged_at', { ascending: false }),
    ])
    setActivities(acts || [])
    setWeeks(wks || [])
    setAllEntries(entries || [])
    setLoading(false)
  }

  const totalEarned = allEntries.reduce((s, e) => s + (e.reward || 0), 0)
  const topActivity = allEntries.reduce((acc, e) => {
    acc[e.activity_name] = (acc[e.activity_name] || 0) + 1
    return acc
  }, {})
  const topName = Object.entries(topActivity).sort((a, b) => b[1] - a[1])[0]

  async function markPaid(week) {
    setPayingId(week.id)
    await supabase.from('weeks').update({ paid: true, paid_at: new Date().toISOString() }).eq('id', week.id)
    await loadAll()
    setPayingId(null)
  }

  async function saveActivity() {
    if (!form.name.trim() || !form.reward) return
    setSaving(true)
    const data = {
      name: form.name.trim(),
      emoji: form.emoji,
      reward: parseFloat(form.reward),
      note: form.note.trim() || null,
      active: true,
    }
    if (editingId) {
      await supabase.from('activities').update(data).eq('id', editingId)
    } else {
      await supabase.from('activities').insert(data)
    }
    setForm(emptyForm)
    setEditingId(null)
    setShowForm(false)
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
    setForm(emptyForm)
    setEditingId(null)
    setShowForm(false)
  }

  function getWeekTotal(weekStart) {
    const start = new Date(weekStart + 'T00:00:00')
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    end.setHours(23, 59, 59)
    return allEntries
      .filter(e => { const d = new Date(e.logged_at); return d >= start && d <= end })
      .reduce((s, e) => s + (e.reward || 0), 0)
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
          <button
            onClick={onExit}
            className="text-sm text-gray-500 bg-[#F0FDFA] rounded-full px-3 py-1 active:bg-tikky-lavender"
          >
            ← Salir
          </button>
        </div>

        <div className="flex gap-1 mt-3 bg-[#F0FDFA] rounded-xl p-1">
          {[
            { id: 'stats', label: 'Stats' },
            { id: 'weeks', label: 'Semanas' },
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
            {/* STATS */}
            {tab === 'stats' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <StatCard emoji="💰" label="Total ganado" value={`${totalEarned.toFixed(2)}€`} />
                  <StatCard emoji="📋" label="Registros" value={allEntries.length} />
                  <StatCard emoji="📅" label="Semanas" value={weeks.length} />
                  <StatCard emoji="✅" label="Actividades activas" value={activities.filter(a => a.active).length} />
                </div>

                {topName && (
                  <div className="bg-white rounded-2xl p-4 border border-[#E2E8F0]">
                    <p className="text-xs text-gray-400 mb-1">Actividad más repetida</p>
                    <p className="font-semibold text-gray-800">{topName[0]}</p>
                    <p className="text-sm text-tikky-pink font-medium">{topName[1]} veces</p>
                  </div>
                )}

                {/* Historial de entradas con opción de eliminar */}
                <div className="bg-white rounded-2xl p-4 border border-[#E2E8F0]">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Historial</h3>
                    <button
                      onClick={() => setShowAllEntries(v => !v)}
                      className="text-xs text-tikky-pink font-medium"
                    >
                      {showAllEntries ? 'Ocultar' : `Ver todo (${allEntries.length})`}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {visibleEntries.map((e, i) => {
                      const date = new Date(e.logged_at)
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
                          <span className="text-tikky-pink font-semibold text-sm">+{e.reward}€</span>
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

            {/* SEMANAS */}
            {tab === 'weeks' && (
              <div className="space-y-2">
                {weeks.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-8">No hay semanas registradas</p>
                )}
                {weeks.map(w => {
                  const total = getWeekTotal(w.week_start)
                  return (
                    <div key={w.id} className="bg-white rounded-2xl p-4 border border-[#E2E8F0]">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-800 text-sm">Sem. {formatDate(w.week_start)}</p>
                          <p className="text-tikky-pink font-bold">{total.toFixed(2)}€</p>
                          {w.paid && (
                            <p className="text-xs text-tikky-pink mt-0.5">
                              ✅ Pagado {w.paid_at ? formatDate(w.paid_at) : ''}
                            </p>
                          )}
                        </div>
                        {!w.paid && (
                          <button
                            onClick={() => markPaid(w)}
                            disabled={payingId === w.id}
                            className="bg-tikky-pink text-white text-xs font-medium px-3 py-1.5 rounded-full active:opacity-80"
                          >
                            {payingId === w.id ? '...' : 'Marcar pagado'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* ACTIVIDADES */}
            {tab === 'activities' && (
              <div className="space-y-3">
                {!showForm && (
                  <button
                    onClick={() => setShowForm(true)}
                    className="w-full bg-tikky-pink text-white font-semibold py-3 rounded-2xl active:opacity-80"
                  >
                    + Nueva actividad
                  </button>
                )}

                {showForm && (
                  <div className="bg-white rounded-2xl p-4 border border-[#E2E8F0] space-y-3">
                    <h3 className="font-semibold text-gray-800">
                      {editingId ? 'Editar actividad' : 'Nueva actividad'}
                    </h3>

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
                        placeholder="Ej: 5"
                        type="number"
                        step="0.5"
                        min="0"
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
                      <button onClick={cancelForm} className="flex-1 border border-[#E2E8F0] text-gray-600 py-2 rounded-xl text-sm">
                        Cancelar
                      </button>
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
                    <div
                      key={act.id}
                      className={`bg-white rounded-2xl px-4 py-3 border border-[#E2E8F0] ${!act.active ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{act.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800 text-sm">{act.name}</p>
                          <p className="text-tikky-pink text-xs font-semibold">{act.reward}€</p>
                          {act.note && <p className="text-xs text-gray-400 truncate">{act.note}</p>}
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => startEdit(act)}
                            className="w-8 h-8 rounded-lg bg-[#F0FDFA] flex items-center justify-center text-sm active:bg-tikky-lavender"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => toggleActive(act)}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm active:opacity-70 ${
                              act.active ? 'bg-tikky-soft' : 'bg-[#F8FAFC]'
                            }`}
                          >
                            {act.active ? '✅' : '⬜'}
                          </button>
                          <button
                            onClick={() => deleteActivity(act.id)}
                            className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-sm active:bg-red-100"
                          >
                            🗑️
                          </button>
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
