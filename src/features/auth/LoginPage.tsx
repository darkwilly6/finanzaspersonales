import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './AuthContext'
import { TextField } from '../../components/ui/Field'
import { Button } from '../../components/ui/Button'
import { loginSchema, type LoginValues } from '../../domain/validation/auth'
import { humanizeFirebaseError } from '../../lib/errors'

export function LoginPage() {
  const { login, status } = useAuth()
  const location = useLocation()
  const [formError, setFormError] = useState('')
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })

  if (status === 'signedIn') {
    const from = (location.state as { from?: string } | null)?.from ?? '/'
    return <Navigate to={from} replace />
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError('')
    try {
      await login(values.email.trim(), values.password)
    } catch (e) {
      setFormError(humanizeFirebaseError(e))
    }
  })

  return (
    <AuthLayout
      title="Inicia sesión"
      subtitle="Entra con tu correo y contraseña."
      footer={<>¿Aún no tienes cuenta? <Link to="/registro">Crear cuenta</Link></>}
    >
      <form onSubmit={onSubmit} noValidate className="stack">
        <TextField label="Correo electrónico" type="email" autoComplete="email" inputMode="email" error={errors.email?.message} {...register('email')} />
        <TextField label="Contraseña" type="password" autoComplete="current-password" error={errors.password?.message} {...register('password')} />
        {formError ? <p className="form-error" role="alert">{formError}</p> : null}
        <Button type="submit" loading={isSubmitting}>Iniciar sesión</Button>
        <p className="small"><Link to="/recuperar">¿Olvidaste tu contraseña?</Link></p>
      </form>
    </AuthLayout>
  )
}
