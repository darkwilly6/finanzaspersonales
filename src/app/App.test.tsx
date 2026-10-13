import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { App } from './App'

describe('App sin configuración de Firebase', () => {
  it('muestra la pantalla de configuración en lugar de fallar o fingir datos', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /falta conectar firebase/i })).toBeInTheDocument()
    expect(screen.getByText('VITE_FIREBASE_API_KEY')).toBeInTheDocument()
    expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument()
  })
})
