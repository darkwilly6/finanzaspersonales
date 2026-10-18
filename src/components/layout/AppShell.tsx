import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { LogOut, PanelLeftClose, PanelLeftOpen, MailWarning, Menu } from 'lucide-react'
import { Logo } from './Logo'
import { Modal } from '../ui/Modal'
import { Topbar } from './Topbar'
import { NAV_ITEMS, isAvailable, type NavItem } from '../../app/navigation'
import { useAuth } from '../../features/auth/AuthContext'
import { useToast } from '../feedback/Toast'
import { RegisterMenu } from '../../features/ledger/RegisterMenu'
import { humanizeFirebaseError } from '../../lib/errors'

const SIDEBAR_KEY = 'capitalos.sidebar'
const MOBILE_LEFT = ['inicio', 'movimientos']
const MOBILE_RIGHT = ['analitica']
const MOBILE_IDS = [...MOBILE_LEFT, ...MOBILE_RIGHT]

function BottomLink({ item }: { item: NavItem }) {
  const Icon = item.icon
  return (
    <NavLink to={item.path} end={item.path === '/'} className={({ isActive }) => `bottom-link ${isActive ? 'is-active' : ''}`}>
      <Icon size={20} aria-hidden /><span>{item.label.split(' ')[0]}</span>
    </NavLink>
  )
}

export function AppShell() {
  const { user, profile, logout, resendVerification, refreshUser } = useAuth()
  const { notify } = useToast()
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) === '1' } catch { return false }
  })
  const [verifyBusy, setVerifyBusy] = useState(false)
  const [more, setMore] = useState(false)

  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0') } catch { /* sin almacenamiento */ }
  }, [collapsed])

  const name = profile?.profile.displayName || user?.displayName || user?.email || 'Tu cuenta'
  const byId = (id: string) => NAV_ITEMS.find((i) => i.id === id && isAvailable(i))

  async function onLogout() {
    try { await logout() } catch (e) { notify('error', humanizeFirebaseError(e)) }
  }

  async function onResend() {
    setVerifyBusy(true)
    try {
      await resendVerification()
      notify('success', 'Te enviamos un correo de verificación. Revisa tu bandeja y el spam.')
    } catch (e) {
      notify('error', humanizeFirebaseError(e))
    } finally {
      setVerifyBusy(false)
    }
  }

  async function onRecheck() {
    setVerifyBusy(true)
    try {
      await refreshUser()
      notify('info', 'Estado de verificación actualizado.')
    } catch (e) {
      notify('error', humanizeFirebaseError(e))
    } finally {
      setVerifyBusy(false)
    }
  }

  return (
    <div className={`shell ${collapsed ? 'is-collapsed' : ''}`}>
      <aside className="sidebar" aria-label="Navegación principal">
        <div className="sidebar-head">
          <Logo compact={collapsed} />
          <button type="button" className="icon-btn hide-mobile" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expandir barra lateral' : 'Contraer barra lateral'} aria-expanded={!collapsed}>
            {collapsed ? <PanelLeftOpen size={18} aria-hidden /> : <PanelLeftClose size={18} aria-hidden />}
          </button>
        </div>

        <div className="register-slot"><RegisterMenu collapsed={collapsed} /></div>

        <nav className="nav">
          <ul>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              if (!isAvailable(item)) {
                return (
                  <li key={item.id}>
                    <button type="button" className="nav-link is-disabled" disabled title={`Se habilita en la Fase ${item.phase}`}>
                      <Icon size={18} aria-hidden /><span className="nav-label">{item.label}</span><span className="nav-tag">Fase {item.phase}</span>
                    </button>
                  </li>
                )
              }
              return (
                <li key={item.id}>
                  <NavLink to={item.path} end={item.path === '/'} className={({ isActive }) => `nav-link ${isActive ? 'is-active' : ''}`} title={collapsed ? item.label : undefined}>
                    <Icon size={18} aria-hidden /><span className="nav-label">{item.label}</span>
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="sidebar-foot">
          <div className="who" title={user?.email ?? ''}>
            <span className="avatar" aria-hidden>{name.slice(0, 1).toUpperCase()}</span>
            <span className="who-text"><strong>{name}</strong><span className="tiny muted">{user?.email}</span></span>
          </div>
          <button type="button" className="icon-btn" onClick={onLogout} aria-label="Cerrar sesión" title="Cerrar sesión"><LogOut size={18} aria-hidden /></button>
        </div>
      </aside>

      <div className="main">
        <Topbar />
        {user && !user.emailVerified ? (
          <div className="banner" role="status">
            <MailWarning size={18} aria-hidden />
            <p>Tu correo aún no está verificado. Verificarlo protege tu cuenta y permite recuperarla.</p>
            <div className="banner-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={onResend} disabled={verifyBusy}>Reenviar correo</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onRecheck} disabled={verifyBusy}>Ya lo verifiqué</button>
            </div>
          </div>
        ) : null}
        <Outlet />
      </div>

      <nav className="bottom-nav" aria-label="Navegación móvil">
        {MOBILE_LEFT.map((id) => { const i = byId(id); return i ? <BottomLink key={id} item={i} /> : null })}
        <div className="bottom-register"><RegisterMenu floating /></div>
        {MOBILE_RIGHT.map((id) => { const i = byId(id); return i ? <BottomLink key={id} item={i} /> : null })}
        <button type="button" className="bottom-link" onClick={() => setMore(true)}><Menu size={20} aria-hidden /><span>Más</span></button>
      </nav>

      <Modal open={more} onClose={() => setMore(false)} title="Menú">
        <ul className="more-list">
          {NAV_ITEMS.filter((i) => !MOBILE_IDS.includes(i.id)).map((item) => {
            const Icon = item.icon
            return isAvailable(item) ? (
              <li key={item.id}><NavLink to={item.path} onClick={() => setMore(false)} className="nav-link"><Icon size={18} aria-hidden /><span className="nav-label">{item.label}</span></NavLink></li>
            ) : (
              <li key={item.id}><span className="nav-link is-disabled"><Icon size={18} aria-hidden /><span className="nav-label">{item.label}</span><span className="nav-tag">Fase {item.phase}</span></span></li>
            )
          })}
          <li><button type="button" className="nav-link" onClick={onLogout}><LogOut size={18} aria-hidden /><span className="nav-label">Cerrar sesión</span></button></li>
        </ul>
      </Modal>
    </div>
  )
}
