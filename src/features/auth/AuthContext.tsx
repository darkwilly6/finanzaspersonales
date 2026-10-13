import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { requireAuth, isFirebaseConfigured } from '../../lib/firebase'
import { loadOrCreateUserProfile } from '../../lib/userProfile'
import type { UserProfileDoc } from '../../domain/types/user'
import { applyTheme } from '../../lib/theme'

type Status = 'loading' | 'signedOut' | 'signedIn'

interface AuthState {
  status: Status
  user: User | null
  profile: UserProfileDoc | null
  profileError: boolean
  register: (displayName: string, email: string, password: string) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  sendReset: (email: string) => Promise<void>
  resendVerification: () => Promise<void>
  refreshUser: () => Promise<void>
  setProfile: (p: UserProfileDoc) => void
  reloadProfile: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(isFirebaseConfigured ? 'loading' : 'signedOut')
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfileDoc | null>(null)
  const [profileError, setProfileError] = useState(false)
  const [profileNonce, setProfileNonce] = useState(0)

  useEffect(() => {
    if (!isFirebaseConfigured) return
    return onAuthStateChanged(requireAuth(), (u) => {
      setUser(u)
      setStatus(u ? 'signedIn' : 'signedOut')
      if (!u) {
        setProfile(null)
        setProfileError(false)
      }
    })
  }, [])

  const uid = user?.uid
  const email = user?.email ?? ''
  const name = user?.displayName ?? ''
  useEffect(() => {
    if (!uid) return
    let cancelled = false
    setProfileError(false)
    loadOrCreateUserProfile(uid, email, name)
      .then((p) => {
        if (cancelled) return
        setProfile(p)
        applyTheme(p.preferences.theme)
      })
      .catch(() => {
        if (!cancelled) setProfileError(true)
      })
    return () => {
      cancelled = true
    }
  }, [uid, email, name, profileNonce])

  const register = useCallback(async (displayName: string, mail: string, password: string) => {
    const auth = requireAuth()
    const cred = await createUserWithEmailAndPassword(auth, mail, password)
    await updateProfile(cred.user, { displayName })
    try {
      await sendEmailVerification(cred.user)
    } catch {
      /* la verificación es opcional: no bloquea el registro */
    }
  }, [])

  const login = useCallback(async (mail: string, password: string) => {
    await signInWithEmailAndPassword(requireAuth(), mail, password)
  }, [])

  const logout = useCallback(async () => {
    await signOut(requireAuth())
  }, [])

  const sendReset = useCallback(async (mail: string) => {
    await sendPasswordResetEmail(requireAuth(), mail)
  }, [])

  const resendVerification = useCallback(async () => {
    const u = requireAuth().currentUser
    if (u) await sendEmailVerification(u)
  }, [])

  const refreshUser = useCallback(async () => {
    const u = requireAuth().currentUser
    if (u) {
      await reload(u)
      setUser(requireAuth().currentUser)
      // reload no emite onAuthStateChanged: forzamos una copia para re-renderizar
      setStatus('signedIn')
    }
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      status,
      user,
      profile,
      profileError,
      register,
      login,
      logout,
      sendReset,
      resendVerification,
      refreshUser,
      setProfile,
      reloadProfile: () => setProfileNonce((n) => n + 1),
    }),
    [status, user, profile, profileError, register, login, logout, sendReset, resendVerification, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
