import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './AuthContext'
import { TextField } from '../../components/ui/Field'
import { Button } from '../../components/ui/Button'
import { registerSchema, type RegisterValues } from '../../domain/validation/auth'
import { humanizeFirebaseError } from '../../lib/errors'

export function RegisterPage() {
  const { register: signUp, status } = useAuth()
  const [formError, setFormError] = useState('')
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) })

  if (status === 'signedIn') return <Navigate to="/" replace />

  const onSubmit = handleSubmit(async (v) => {
    setFormError('')
    try {
      await signUp(v.displayName.trim(), v.email.trim(), v.password)
    } catch (e) {
      setFormError(humanizeFirebaseError(e))
    }
  })

  return (
    <AuthLayout
      title="Crea tu cuenta"
      subtitle="Un solo acceso para tus finanzas personales y las de tus negocios."
      footer={<>¿Ya tienes cuenta? <Link to="/login">Iniciar sesión</Link></>}
    >
      <form onSubmit={onSubmit} noValidate className="stack">
        <TextField label="Nombre" autoComplete="name" error={errors.displayName?.message} {...register('displayName')} />
        <TextField label="Correo electrónico" type="email" autoComplete="email" inputMode="email" error={errors.email?.message} {...register('email')} />
        <TextField label="Contraseña" type="password" autoComplete="new-password" hint="Mínimo 8 caracteres, con letras y números." error={errors.password?.message} {...register('password')} />
        <TextField label="Repite la contraseña" type="password" autoComplete="new-password" error={errors.confirmPassword?.message} {...register('confirmPassword')} />
        {formError ? <p className="form-error" role="alert">{formError}</p> : null}
        <Button type="submit" loading={isSubmitting}>Crear cuenta</Button>
      </form>
    </AuthLayout>
  )
}
