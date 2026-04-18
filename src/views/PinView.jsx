import { useState, useEffect } from 'react'

export default function PinView({ onSuccess, onCancel, error }) {
  const [pin, setPin] = useState('')

  useEffect(() => {
    if (error) {
      setTimeout(() => setPin(''), 600)
    }
  }, [error])

  function handleDigit(d) {
    if (pin.length >= 4) return
    const next = pin + d
    setPin(next)
    if (next.length === 4) {
      setTimeout(() => onSuccess(next), 150)
    }
  }

  function handleDelete() {
    setPin((p) => p.slice(0, -1))
  }

  const digits = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center px-6">
      <div className="mb-8 text-center">
        <div className="text-4xl mb-2">🔐</div>
        <h1 className="text-xl font-semibold text-gray-800">Zona Admin</h1>
        <p className="text-sm text-gray-400 mt-1">Introduce el PIN</p>
      </div>

      {/* Puntos PIN */}
      <div className="flex gap-4 mb-8">
        {[0,1,2,3].map((i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
              pin.length > i
                ? error
                  ? 'bg-red-400 border-red-400'
                  : 'bg-tikky-pink border-tikky-pink'
                : 'border-gray-300 bg-transparent'
            }`}
          />
        ))}
      </div>

      {error && (
        <p className="text-red-400 text-sm mb-4 animate-pulse">PIN incorrecto</p>
      )}

      {/* Teclado numérico */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-xs mb-6">
        {digits.map((d, i) => {
          if (d === '') return <div key={i} />
          return (
            <button
              key={i}
              onClick={() => d === '⌫' ? handleDelete() : handleDigit(d)}
              className={`h-16 rounded-2xl text-xl font-medium transition-all active:scale-95 ${
                d === '⌫'
                  ? 'bg-white text-gray-500 shadow-sm'
                  : 'bg-white text-gray-800 border border-[#E2E8F0] hover:bg-tikky-lavender'
              }`}
            >
              {d}
            </button>
          )
        })}
      </div>

      <button
        onClick={onCancel}
        className="text-sm text-gray-400 underline underline-offset-2"
      >
        Cancelar
      </button>
    </div>
  )
}
