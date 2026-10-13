import type { ThemePreference } from '../domain/types/user'

const KEY = 'capitalos.theme'

export function getStoredTheme(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'system' || v === 'dark' ? v : 'dark'
  } catch {
    return 'dark'
  }
}

/** Resuelve "system" al tema real y lo aplica al documento. Solo guarda la preferencia visual. */
export function applyTheme(pref: ThemePreference): void {
  const resolved =
    pref === 'system'
      ? matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark'
      : pref
  document.documentElement.dataset.theme = resolved
  try {
    localStorage.setItem(KEY, pref)
  } catch {
    /* sin almacenamiento disponible: el tema solo dura la sesión */
  }
}
