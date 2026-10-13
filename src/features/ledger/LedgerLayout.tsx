import { LedgerData } from './LedgerData'
import { FilterProvider } from './FilterContext'
import { RegisterProvider } from './RegisterContext'
import { AppShell } from '../../components/layout/AppShell'

/** Todo lo que está dentro de la sesión comparte los mismos datos en tiempo real, filtros y formulario de registro. */
export function LedgerLayout() {
  return (
    <LedgerData>
      <FilterProvider>
        <RegisterProvider>
          <AppShell />
        </RegisterProvider>
      </FilterProvider>
    </LedgerData>
  )
}
