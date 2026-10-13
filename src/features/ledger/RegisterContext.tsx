import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { TransactionModal, type OpenOptions } from './TransactionModal'

interface RegisterState {
  openTransaction: (opts?: OpenOptions) => void
}
const Ctx = createContext<RegisterState | null>(null)

export function RegisterProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<OpenOptions>({})
  const openTransaction = useCallback((opts: OpenOptions = {}) => { setOptions(opts); setOpen(true) }, [])
  const value = useMemo(() => ({ openTransaction }), [openTransaction])
  return (
    <Ctx.Provider value={value}>
      {children}
      <TransactionModal open={open} onClose={() => setOpen(false)} options={options} />
    </Ctx.Provider>
  )
}

export function useRegister(): RegisterState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useRegister debe usarse dentro de RegisterProvider')
  return v
}
