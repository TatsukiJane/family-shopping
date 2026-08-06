import { useEffect } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { MainScreen } from '@/screens/MainScreen'
import { SetupScreen } from '@/screens/SetupScreen'
import { useApp } from '@/store/useApp'

export default function App() {
  const phase = useApp((state) => state.phase)
  const init = useApp((state) => state.init)

  useEffect(() => {
    void init()
  }, [init])

  return (
    <>
      {phase === 'loading' && <div className="h-full" />}
      {phase === 'setup' && <SetupScreen />}
      {phase === 'ready' && <MainScreen />}
      <Toaster position="bottom-center" />
    </>
  )
}
