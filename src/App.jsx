import { useState } from 'react'
import TikkyView from './views/TikkyView'
import AdminView from './views/AdminView'
import PinView from './views/PinView'

const ADMIN_PIN = '1234'

export default function App() {
  const [view, setView] = useState('tikky') // 'tikky' | 'pin' | 'admin'
  const [pinError, setPinError] = useState(false)

  function handlePinSuccess(pin) {
    if (pin === ADMIN_PIN) {
      setPinError(false)
      setView('admin')
    } else {
      setPinError(true)
    }
  }

  function handleAdminExit() {
    setView('tikky')
  }

  if (view === 'pin') {
    return (
      <PinView
        onSuccess={handlePinSuccess}
        onCancel={() => { setPinError(false); setView('tikky') }}
        error={pinError}
      />
    )
  }

  if (view === 'admin') {
    return <AdminView onExit={handleAdminExit} />
  }

  return (
    <TikkyView onAdminPress={() => setView('pin')} />
  )
}
