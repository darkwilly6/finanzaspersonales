import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { updateProfile } from 'firebase/auth'
import { KeyRound, LogOut } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { TextField, SelectField } from '../../components/ui/Field'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/feedback/Skeleton'
import { useToast } from '../../components/feedback/Toast'
import { profileSchema, type ProfileValues } from '../../domain/validation/auth'
import { CURRENCIES } from '../../domain/types/user'
import { saveUserProfile } from '../../lib/userProfile'
import { applyTheme } from '../../lib/theme'
import { humanizeFirebaseError } from '../../lib/errors'
import { requireAuth } from '../../lib/firebase'

function timezoneList(current: string): string[] {
  let list: string[] = []
  try {
    list = Intl.supportedValuesOf('timeZone')
  } catch {
    list = ['America/El_Salvador', 'America/Mexico_City', 'America/Bogota', 'America/New_York', 'Europe/Madrid', 'UTC']
  }
  return list.includes(current) ? list : [current, ...list]
}

function ProfileForm(props: {
  initial: ProfileValues
  currencyLabel: (c: string) => string
  onSave: (v: ProfileValues) => Promise<void>
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileValues>({ resolver: zodResolver(profileSchema), defaultValues: props.initial })
  const zones = useMemo(() => timezoneList(props.initial.timezone), [props.initial.timezone])
  const currencies = useMemo(
    () => (CURRENCIES as readonly string[]).includes(props.initial.defaultCurrency) ? [...CURRENCIES] : [props.initial.defaultCurrency, ...CURRENCIES],
    [props.initial.defaultCurrency],
  )

  return (
    <form className="panel stack" onSubmit={handleSubmit(props.onSave)} noValidate aria-labelledby="profile-title">
      <h2 id="profile-title">Perfil y preferencias</h2>
      <TextField label="Nombre" autoComplete="name" error={errors.displayName?.message} {...register('displayName')} />
      <div className="grid-2">
        <SelectField label="Moneda predeterminada" hint="Se usará al crear cuentas y negocios nuevos." error={errors.defaultCurrency?.message} {...register('defaultCurrency')}>
          {currencies.map((c) => <option key={c} value={c}>{props.currencyLabel(c)}</option>)}
        </SelectField>
        <SelectField label="Zona horaria" hint="Define dónde empieza y termina cada día y cada mes." error={errors.timezone?.message} {...register('timezone')}>
          {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
        </SelectField>
      </div>
      <SelectField label="Tema" error={errors.theme?.message} {...register('theme')}>
        <option value="dark">Oscuro</option>
        <option value="light">Claro</option>
        <option value="system">Igual que mi dispositivo</option>
      </SelectField>
      <div className="row">
        <Button type="submit" loading={isSubmitting} disabled={!isDirty}>Guardar cambios</Button>
        {!isDirty ? <span className="muted small">No hay cambios por guardar.</span> : null}
      </div>
    </form>
  )
}

export function SettingsPage() {
  const { user, profile, setProfile, logout, sendReset } = useAuth()
  const { notify } = useToast()
  const [resetBusy, setResetBusy] = useState(false)

  const currencyNames = useMemo(() => {
    try { return new Intl.DisplayNames(['es'], { type: 'currency' }) } catch { return null }
  }, [])

  if (!profile || !user) {
    return (
      <div className="page"><header className="page-head"><h1>Configuración</h1></header>
        <div className="panel stack"><Skeleton height={20} width="40%" /><Skeleton height={40} /><Skeleton height={40} /></div>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Configuración</h1>
          <p className="muted">Tu perfil y preferencias. Se guardan en tu cuenta y se aplican en todos tus dispositivos.</p>
        </div>
      </header>

      <ProfileForm
        key={`${profile.profile.displayName}|${profile.preferences.timezone}|${profile.preferences.defaultCurrency}|${profile.preferences.theme}`}
        initial={{
          displayName: profile.profile.displayName,
          timezone: profile.preferences.timezone,
          defaultCurrency: profile.preferences.defaultCurrency,
          theme: profile.preferences.theme,
        }}
        currencyLabel={(c) => (currencyNames?.of(c) ? `${c} · ${currencyNames.of(c)}` : c)}
        onSave={async (v) => {
          try {
            const auth = requireAuth()
            if (auth.currentUser && auth.currentUser.displayName !== v.displayName.trim()) {
              await updateProfile(auth.currentUser, { displayName: v.displayName.trim() })
            }
            await saveUserProfile(user.uid, v)
            setProfile({
              ...profile,
              profile: { ...profile.profile, displayName: v.displayName.trim() },
              preferences: { timezone: v.timezone, defaultCurrency: v.defaultCurrency, theme: v.theme },
            })
            applyTheme(v.theme)
            notify('success', 'Cambios guardados.')
          } catch (e) {
            notify('error', humanizeFirebaseError(e))
          }
        }}
      />

      <section className="panel" aria-labelledby="sec-title">
        <h2 id="sec-title">Seguridad y sesión</h2>
        <dl className="kv">
          <div><dt>Correo</dt><dd>{user.email}</dd></div>
          <div><dt>Verificación</dt><dd>{user.emailVerified ? 'Correo verificado' : 'Sin verificar'}</dd></div>
        </dl>
        <div className="row">
          <Button
            variant="secondary"
            icon={<KeyRound size={16} aria-hidden />}
            loading={resetBusy}
            onClick={async () => {
              setResetBusy(true)
              try {
                await sendReset(user.email ?? '')
                notify('success', 'Te enviamos un correo para cambiar tu contraseña.')
              } catch (e) {
                notify('error', humanizeFirebaseError(e))
              } finally {
                setResetBusy(false)
              }
            }}
          >
            Cambiar contraseña por correo
          </Button>
          <Button variant="ghost" icon={<LogOut size={16} aria-hidden />} onClick={() => logout().catch((e) => notify('error', humanizeFirebaseError(e)))}>
            Cerrar sesión
          </Button>
        </div>
      </section>
    </div>
  )

}
