import { useState } from 'react'
import { Download, FileJson, FileSpreadsheet } from 'lucide-react'
import { LedgerGate } from '../ledger/LedgerGate'
import { useLedger } from '../ledger/LedgerData'
import { useAuth } from '../auth/AuthContext'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/feedback/Toast'
import { backupJson, salesCsv, transactionsCsv } from '../../domain/export'

const KEY = 'capitalos.lastBackup'
const APP_VERSION = '1.0.0'

function download(filename: string, content: string, mime: string) {
  // BOM para que Excel respete los acentos en CSV.
  const blob = new Blob([mime.includes('csv') ? '\ufeff' : '', content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function ExportPage() {
  const { user } = useAuth()
  const ledger = useLedger()
  const { notify } = useToast()
  const [last, setLast] = useState(() => { try { return localStorage.getItem(KEY) } catch { return null } })
  const stamp = ledger.today

  function markBackup() {
    const now = new Date().toISOString()
    try { localStorage.setItem(KEY, now) } catch { /* sin almacenamiento */ }
    setLast(now)
  }

  const counts = { movimientos: ledger.transactions.length, ventas: ledger.sales.length, productos: ledger.products.length, cuentas: ledger.accounts.length, negocios: ledger.businesses.length }
  const days = last ? Math.floor((Date.now() - Date.parse(last)) / 86_400_000) : null

  return (
    <div className="page wide">
      <header className="page-head"><div><h1>Exportar y respaldo</h1><p className="muted">Tus datos son tuyos. Descarga un respaldo completo y tus movimientos y ventas en CSV para Excel o Google Sheets.</p></div></header>
      <LedgerGate>
        <section className="panel" aria-labelledby="bk-title">
          <h2 id="bk-title">Respaldo completo (JSON)</h2>
          <p className="small muted">Incluye negocios, cuentas, categorías, movimientos, ventas, productos, stock, pagos fijos, tareas, cierres y metas. Los importes van en centavos enteros.</p>
          <p className="small">{last ? <>Último respaldo desde este navegador: <b>{new Date(last).toLocaleString('es')}</b>{days !== null && days >= 30 ? ' · ya pasaron 30 días o más, haz uno nuevo.' : ''}</> : <b>Aún no has hecho ningún respaldo desde este navegador.</b>}</p>
          <div className="row">
            <Button icon={<FileJson size={16} aria-hidden />} onClick={() => {
              const json = backupJson({
                businesses: ledger.businesses, accounts: ledger.accounts, categories: ledger.categories, transactions: ledger.transactions, sales: ledger.sales, products: ledger.products,
                inventoryMoves: ledger.inventoryMoves, recurring: ledger.recurring, tasks: ledger.tasks, closings: ledger.closings, goals: ledger.goals,
              }, { appVersion: APP_VERSION, exportedAt: new Date().toISOString(), email: user?.email ?? '' })
              download(`capital-os-respaldo-${stamp}.json`, json, 'application/json')
              markBackup()
              notify('success', 'Respaldo descargado. Guárdalo en un lugar seguro.')
            }}>Descargar respaldo</Button>
          </div>
          <p className="tiny muted">Contiene tu información financiera: guárdalo como guardarías un estado de cuenta. Por ahora no hay botón de restaurar: el archivo sirve para conservar y reconstruir tus datos.</p>
        </section>

        <section className="panel" aria-labelledby="csv-title">
          <h2 id="csv-title">Hojas de cálculo (CSV)</h2>
          <div className="row">
            <Button variant="secondary" icon={<FileSpreadsheet size={16} aria-hidden />} onClick={() => { download(`capital-os-movimientos-${stamp}.csv`, transactionsCsv(ledger.transactions, ledger.accounts, ledger.businesses, ledger.categories), 'text/csv'); notify('success', 'Movimientos descargados.') }}>Movimientos ({counts.movimientos})</Button>
            <Button variant="secondary" icon={<Download size={16} aria-hidden />} onClick={() => { download(`capital-os-ventas-${stamp}.csv`, salesCsv(ledger.sales, ledger.businesses), 'text/csv'); notify('success', 'Ventas descargadas.') }}>Ventas por producto ({counts.ventas})</Button>
          </div>
          <p className="tiny muted">Los importes están en dólares con dos decimales. Los movimientos anulados se incluyen con su estado y motivo.</p>
        </section>
      </LedgerGate>
    </div>
  )
}
