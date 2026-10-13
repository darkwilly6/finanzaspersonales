import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { MailCheck } from 'lucide-react'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './AuthContext'
import { TextField } from '../../components/ui/Field'
import { Button } from '../../components/ui/Button'
import { resetSchema, type ResetValues } from '../../domain/validation/auth'
import { humanizeFirebaseError } from '../../lib/errors'

export function ForgotPasswordPage() {
  const { sendReset } = useAuth()
  const [sentTo, setSentTo] = useState('')
  const [formError, setFormError] = useState('')
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetValues>({ resolver: zodResolver(resetSchema) })

  const onSubmit = handleSubmit(async ({ email }) => {
    setFormError('')
    try {
      await sendReset(email.trim())
      setSentTo(email.trim())
    } catch (e) {
      const code = (e as { code?: string }).code
      // Por privacidad no revelamos si el correo existe.
      if (code === 'auth/user-not-found') setSentTo(email.trim())
      else setFormError(humanizeFirebaseError(e))
    }
  })

  return (
    <AuthLayout title="Recupera tu contraseña" subtitle="Te enviaremos un enlace para crear una nueva." footer={<Link to="/login">Volver a iniciar sesión</Link>}>
      {sentTo ? (
        <div className="notice notice-ok" role="status">
          <MailCheck size={20} aria-hidden />
          <p>Si <strong>{sentTo}</strong> tiene una cuenta, recibirás un correo con el enlace. Revisa también la carpeta de spam.</p>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="stack">
          <TextField label="Correo electrónico" type="email" autoComplete="email" inputMode="email" error={errors.email?.message} {...register('email')} />
          {formError ? <p className="form-error" role="alert">{formError}</p> : null}
          <Button type="submit" loading={isSubmitting}>Enviar enlace</Button>
        </form>
      )}
    </AuthLayout>
  )
}
