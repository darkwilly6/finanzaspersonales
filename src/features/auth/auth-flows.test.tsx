import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const auth = {
  status: 'signedOut' as 'loading' | 'signedOut' | 'signedIn',
  login: vi.fn(),
  register: vi.fn(),
  sendReset: vi.fn(),
}

vi.mock('./AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../../lib/firebase', () => ({ isFirebaseConfigured: true, missingFirebaseVars: [] }))

import { LoginPage } from './LoginPage'
import { RegisterPage } from './RegisterPage'
import { ForgotPasswordPage } from './ForgotPasswordPage'
import { ProtectedRoute } from './ProtectedRoute'

beforeEach(() => {
  auth.status = 'signedOut'
  auth.login.mockReset()
  auth.register.mockReset()
  auth.sendReset.mockReset()
})

describe('LoginPage', () => {
  it('muestra errores de validación sin llamar a Firebase', async () => {
    render(<MemoryRouter><LoginPage /></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }))
    expect(await screen.findByText(/escribe tu correo/i)).toBeInTheDocument()
    expect(auth.login).not.toHaveBeenCalled()
  })

  it('envía credenciales válidas', async () => {
    auth.login.mockResolvedValue(undefined)
    render(<MemoryRouter><LoginPage /></MemoryRouter>)
    await userEvent.type(screen.getByLabelText(/correo/i), 'ana@correo.com')
    await userEvent.type(screen.getByLabelText(/contraseña/i), 'clave1234')
    await userEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }))
    await waitFor(() => expect(auth.login).toHaveBeenCalledWith('ana@correo.com', 'clave1234'))
  })

  it('traduce el error de credenciales a un mensaje humano', async () => {
    auth.login.mockRejectedValue({ code: 'auth/invalid-credential' })
    render(<MemoryRouter><LoginPage /></MemoryRouter>)
    await userEvent.type(screen.getByLabelText(/correo/i), 'ana@correo.com')
    await userEvent.type(screen.getByLabelText(/contraseña/i), 'mala')
    await userEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/correo o contraseña incorrectos/i)
  })
})

describe('RegisterPage', () => {
  it('rechaza contraseñas que no coinciden', async () => {
    render(<MemoryRouter><RegisterPage /></MemoryRouter>)
    await userEvent.type(screen.getByLabelText('Nombre'), 'Ana')
    await userEvent.type(screen.getByLabelText(/correo/i), 'ana@correo.com')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'clave1234')
    await userEvent.type(screen.getByLabelText(/repite/i), 'otra12345')
    await userEvent.click(screen.getByRole('button', { name: /crear cuenta/i }))
    expect(await screen.findByText(/no coinciden/i)).toBeInTheDocument()
    expect(auth.register).not.toHaveBeenCalled()
  })

  it('muestra "ya existe una cuenta" si el correo está en uso', async () => {
    auth.register.mockRejectedValue({ code: 'auth/email-already-in-use' })
    render(<MemoryRouter><RegisterPage /></MemoryRouter>)
    await userEvent.type(screen.getByLabelText('Nombre'), 'Ana')
    await userEvent.type(screen.getByLabelText(/correo/i), 'ana@correo.com')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'clave1234')
    await userEvent.type(screen.getByLabelText(/repite/i), 'clave1234')
    await userEvent.click(screen.getByRole('button', { name: /crear cuenta/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/ya existe una cuenta/i)
  })
})

describe('ForgotPasswordPage', () => {
  it('confirma el envío sin revelar si el correo existe', async () => {
    auth.sendReset.mockRejectedValue({ code: 'auth/user-not-found' })
    render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>)
    await userEvent.type(screen.getByLabelText(/correo/i), 'nadie@correo.com')
    await userEvent.click(screen.getByRole('button', { name: /enviar enlace/i }))
    expect(await screen.findByText(/si/i, { selector: 'p' })).toHaveTextContent(/recibirás un correo/i)
  })
})

describe('ProtectedRoute', () => {
  const tree = (
    <MemoryRouter initialEntries={['/privado']}>
      <Routes>
        <Route path="/login" element={<p>pantalla de login</p>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/privado" element={<p>contenido privado</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )

  it('redirige a login sin sesión', () => {
    auth.status = 'signedOut'
    render(tree)
    expect(screen.getByText('pantalla de login')).toBeInTheDocument()
    expect(screen.queryByText('contenido privado')).not.toBeInTheDocument()
  })

  it('muestra carga mientras se verifica la sesión, sin filtrar contenido', () => {
    auth.status = 'loading'
    render(tree)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText('contenido privado')).not.toBeInTheDocument()
  })

  it('permite el acceso con sesión', () => {
    auth.status = 'signedIn'
    render(tree)
    expect(screen.getByText('contenido privado')).toBeInTheDocument()
  })
})
