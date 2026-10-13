import { describe, expect, it } from 'vitest'
import { humanizeFirebaseError } from './errors'

describe('humanizeFirebaseError', () => {
  it('traduce códigos conocidos', () => {
    expect(humanizeFirebaseError({ code: 'auth/email-already-in-use' })).toMatch(/Ya existe/)
    expect(humanizeFirebaseError({ code: 'auth/invalid-credential' })).toMatch(/incorrectos/)
    expect(humanizeFirebaseError({ code: 'auth/network-request-failed' })).toMatch(/conexión/)
    expect(humanizeFirebaseError({ code: 'resource-exhausted' })).toMatch(/límite/)
  })
  it('no filtra detalles técnicos en errores desconocidos', () => {
    const msg = humanizeFirebaseError(new Error('stack secreto /srv/app'))
    expect(msg).not.toMatch(/secreto|srv/)
  })
})
