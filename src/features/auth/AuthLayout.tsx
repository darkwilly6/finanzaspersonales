import type { ReactNode } from 'react'
import { Logo } from '../../components/layout/Logo'

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="auth">
      <section className="auth-side" aria-label="Qué hace Capital OS">
        <Logo />
        <div className="auth-statement">
          <h2>Cada cifra con su nombre correcto.</h2>
          <dl className="ledger">
            <div><dt>Efectivo</dt><dd>Lo que hay hoy en tus cuentas.</dd></div>
            <div><dt>Beneficio</dt><dd>Lo que el negocio gana después de sus costos.</dd></div>
            <div><dt>Capital invertido</dt><dd>Dinero puesto a trabajar, no gastado.</dd></div>
            <div><dt>Distribuible</dt><dd>Lo que puedes pagarte sin debilitar el negocio.</dd></div>
          </dl>
        </div>
        <p className="muted small">Tus datos se guardan en tu propio proyecto de Firebase y solo tú puedes leerlos.</p>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-mobile-logo"><Logo /></div>
          <h1>{title}</h1>
          {subtitle ? <p className="muted">{subtitle}</p> : null}
          {children}
          {footer ? <div className="auth-footer">{footer}</div> : null}
        </div>
      </section>
    </main>
  )
}
