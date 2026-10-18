import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Moon, Sun } from 'lucide-react'
import { GlobalSearch } from './GlobalSearch'
import { Logo } from './Logo'
import { useAuth } from '../../features/auth/AuthContext'
import { useAlerts } from '../../features/ledger/useInsights'
import { useToast } from '../feedback/Toast'
import { applyTheme } from '../../lib/theme'
import { saveUserProfile } from '../../lib/userProfile'
import { humanizeFirebaseError } from '../../lib/errors'

const currentTheme = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')

export function Topbar() {
  const { user, profile, setProfile } = useAuth()
  const alerts = useAlerts()
  const { notify } = useToast()
  const [theme, setTheme] = useState<'light' | 'dark'>(currentTheme)
  const name = profile?.profile.displayName || user?.displayName || user?.email || ''

  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(currentTheme()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  async function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    if (!user || !profile) return
    try {
      await saveUserProfile(user.uid, { displayName: profile.profile.displayName, timezone: profile.preferences.timezone, defaultCurrency: profile.preferences.defaultCurrency, theme: next })
      setProfile({ ...profile, preferences: { ...profile.preferences, theme: next } })
    } catch (e) {
      notify('error', humanizeFirebaseError(e))
    }
  }

  const critical = alerts.some((a) => a.severity === 'critical')

  return (
    <header className="topbar">
      <Link to="/" className="topbar-logo" aria-label="Ir al inicio"><Logo /></Link>
      <GlobalSearch />
      <div className="topbar-actions">
        <Link to="/alertas" className="icon-btn bell" aria-label={alerts.length ? `Alertas: ${alerts.length}` : 'Alertas'}>
          <Bell size={20} aria-hidden />
          {alerts.length ? <span className={`badge ${critical ? 'badge-critical' : ''}`} aria-hidden>{alerts.length > 9 ? '9+' : alerts.length}</span> : null}
        </Link>
        <button type="button" className="icon-btn" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'} title={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}>
          {theme === 'dark' ? <Moon size={20} aria-hidden /> : <Sun size={20} aria-hidden />}
        </button>
        <Link to="/configuracion" className="avatar avatar-lg" aria-label="Configuración y perfil" title={name}>{name.slice(0, 1).toUpperCase() || '·'}</Link>
      </div>
    </header>
  )
}
