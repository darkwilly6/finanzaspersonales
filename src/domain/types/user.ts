export type ThemePreference = 'dark' | 'light' | 'system'

export interface UserProfileDoc {
  schemaVersion: 1
  profile: { displayName: string; email: string }
  preferences: { timezone: string; defaultCurrency: string; theme: ThemePreference }
}

export const CURRENCIES = ['USD', 'EUR', 'MXN', 'COP', 'GTQ', 'HNL', 'CRC', 'PEN', 'CLP', 'ARS', 'BRL', 'GBP'] as const
