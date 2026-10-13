import { describe, expect, it } from 'vitest'
import { loginSchema, profileSchema, registerSchema, resetSchema } from './auth'

describe('validación de autenticación', () => {
  it('acepta un registro válido', () => {
    const r = registerSchema.safeParse({
      displayName: 'Ana Pérez',
      email: 'ana@correo.com',
      password: 'clave1234',
      confirmPassword: 'clave1234',
    })
    expect(r.success).toBe(true)
  })
  it('rechaza contraseñas distintas, débiles y correos inválidos', () => {
    const r = registerSchema.safeParse({
      displayName: 'A',
      email: 'no-es-correo',
      password: 'corta',
      confirmPassword: 'otra',
    })
    expect(r.success).toBe(false)
  })
  it('exige letras y números', () => {
    const r = registerSchema.safeParse({
      displayName: 'Ana',
      email: 'ana@correo.com',
      password: 'sololetras',
      confirmPassword: 'sololetras',
    })
    expect(r.success).toBe(false)
  })
  it('login exige correo y contraseña', () => {
    expect(loginSchema.safeParse({ email: '', password: '' }).success).toBe(false)
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true)
  })
  it('recuperación exige correo válido', () => {
    expect(resetSchema.safeParse({ email: 'xx' }).success).toBe(false)
  })
  it('perfil valida moneda ISO y tema', () => {
    expect(
      profileSchema.safeParse({ displayName: 'Ana', timezone: 'America/El_Salvador', defaultCurrency: 'usd', theme: 'dark' }).success,
    ).toBe(false)
    expect(
      profileSchema.safeParse({ displayName: 'Ana', timezone: 'America/El_Salvador', defaultCurrency: 'USD', theme: 'dark' }).success,
    ).toBe(true)
  })
})
