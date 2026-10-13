import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { requireDb } from './firebase'
import type { ThemePreference, UserProfileDoc } from '../domain/types/user'

/** Ruta única del documento de usuario: toda la data vive bajo users/{uid}. */
const userRef = (uid: string) => doc(requireDb(), 'users', uid)

export function defaultTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/El_Salvador'
  } catch {
    return 'America/El_Salvador'
  }
}

export function normalizeTheme(value: unknown): ThemePreference {
  return value === 'light' || value === 'system' || value === 'dark' ? value : 'dark'
}

/**
 * Lee el documento de usuario; si no existe lo crea con valores por defecto.
 * El uid siempre viene de la sesión autenticada, nunca de un campo editable.
 */
export async function loadOrCreateUserProfile(
  uid: string,
  email: string,
  displayName: string,
): Promise<UserProfileDoc> {
  const ref = userRef(uid)
  const snap = await getDoc(ref)
  if (snap.exists()) {
    const d = snap.data() as Partial<UserProfileDoc>
    return {
      schemaVersion: 1,
      profile: {
        displayName: d.profile?.displayName ?? displayName,
        email: d.profile?.email ?? email,
      },
      preferences: {
        timezone: d.preferences?.timezone ?? defaultTimezone(),
        defaultCurrency: d.preferences?.defaultCurrency ?? 'USD',
        theme: normalizeTheme(d.preferences?.theme),
      },
    }
  }

  const fresh: UserProfileDoc = {
    schemaVersion: 1,
    profile: { displayName: displayName || email.split('@')[0] || 'Usuario', email },
    preferences: { timezone: defaultTimezone(), defaultCurrency: 'USD', theme: 'dark' },
  }
  await setDoc(ref, { ...fresh, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  return fresh
}

export async function saveUserProfile(
  uid: string,
  values: {
    displayName: string
    timezone: string
    defaultCurrency: string
    theme: ThemePreference
  },
): Promise<void> {
  await updateDoc(userRef(uid), {
    'profile.displayName': values.displayName.trim(),
    'preferences.timezone': values.timezone,
    'preferences.defaultCurrency': values.defaultCurrency,
    'preferences.theme': values.theme,
    updatedAt: serverTimestamp(),
  })
}
