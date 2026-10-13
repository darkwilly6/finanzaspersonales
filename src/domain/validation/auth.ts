import { z } from 'zod'

const email = z
  .string()
  .trim()
  .min(1, 'Escribe tu correo electrónico.')
  .max(254, 'El correo es demasiado largo.')
  .pipe(z.email('Escribe un correo válido, por ejemplo nombre@dominio.com.'))

const password = z
  .string()
  .min(8, 'Usa al menos 8 caracteres.')
  .max(128, 'La contraseña es demasiado larga.')

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Escribe tu contraseña.'),
})

export const registerSchema = z
  .object({
    displayName: z.string().trim().min(2, 'Escribe tu nombre.').max(80, 'Máximo 80 caracteres.'),
    email,
    password: password.refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), {
      message: 'Combina letras y números.',
    }),
    confirmPassword: z.string().min(1, 'Repite la contraseña.'),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Las contraseñas no coinciden.',
  })

export const resetSchema = z.object({ email })

export const profileSchema = z.object({
  displayName: z.string().trim().min(2, 'Escribe tu nombre.').max(80, 'Máximo 80 caracteres.'),
  timezone: z.string().min(1, 'Elige una zona horaria.').max(64),
  defaultCurrency: z.string().regex(/^[A-Z]{3}$/, 'Elige una moneda.'),
  theme: z.enum(['dark', 'light', 'system']),
})

export type LoginValues = z.infer<typeof loginSchema>
export type RegisterValues = z.infer<typeof registerSchema>
export type ResetValues = z.infer<typeof resetSchema>
export type ProfileValues = z.infer<typeof profileSchema>
