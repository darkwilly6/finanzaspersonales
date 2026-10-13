import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore'

let env: RulesTestEnvironment

const validDoc = (email: string) => ({
  schemaVersion: 1,
  profile: { displayName: 'Ana', email },
  preferences: { timezone: 'America/El_Salvador', defaultCurrency: 'USD', theme: 'dark' },
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
})

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-capital-os',
    firestore: { rules: readFileSync('firebase/firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})
afterAll(async () => env.cleanup())
beforeEach(async () => env.clearFirestore())

const asA = () => env.authenticatedContext('userA', { email: 'a@correo.com' }).firestore()
const asB = () => env.authenticatedContext('userB', { email: 'b@correo.com' }).firestore()
const anon = () => env.unauthenticatedContext().firestore()

describe('users/{uid}', () => {
  it('el dueño puede crear y leer su documento', async () => {
    await assertSucceeds(setDoc(doc(asA(), 'users/userA'), validDoc('a@correo.com')))
    await assertSucceeds(getDoc(doc(asA(), 'users/userA')))
  })

  it('un usuario NO puede leer ni escribir los datos de otro (acceso cruzado)', async () => {
    await assertSucceeds(setDoc(doc(asA(), 'users/userA'), validDoc('a@correo.com')))
    await assertFails(getDoc(doc(asB(), 'users/userA')))
    await assertFails(setDoc(doc(asB(), 'users/userA'), validDoc('b@correo.com')))
    await assertFails(updateDoc(doc(asB(), 'users/userA'), { 'preferences.theme': 'light' }))
  })

  it('sin sesión no se puede leer ni escribir', async () => {
    await assertFails(getDoc(doc(anon(), 'users/userA')))
    await assertFails(setDoc(doc(anon(), 'users/userA'), validDoc('a@correo.com')))
  })

  it('no se puede crear con el correo de otra persona', async () => {
    await assertFails(setDoc(doc(asA(), 'users/userA'), validDoc('otro@correo.com')))
  })

  it('rechaza campos extra, moneda inválida y tema inválido', async () => {
    const ref = doc(asA(), 'users/userA')
    await assertFails(setDoc(ref, { ...validDoc('a@correo.com'), isAdmin: true }))
    const badCurrency = validDoc('a@correo.com')
    badCurrency.preferences.defaultCurrency = 'usd'
    await assertFails(setDoc(ref, badCurrency))
    const badTheme = validDoc('a@correo.com')
    badTheme.preferences.theme = 'neon'
    await assertFails(setDoc(ref, badTheme))
  })

  it('permite actualizar preferencias válidas pero no createdAt', async () => {
    const ref = doc(asA(), 'users/userA')
    await assertSucceeds(setDoc(ref, validDoc('a@correo.com')))
    await assertSucceeds(updateDoc(ref, { 'preferences.theme': 'light', updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(ref, { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }))
  })

  it('no permite borrar el documento', async () => {
    const ref = doc(asA(), 'users/userA')
    await assertSucceeds(setDoc(ref, validDoc('a@correo.com')))
    await assertFails(deleteDoc(ref))
  })
})

describe('rutas no previstas', () => {
  it('deniega cualquier otra colección, incluso al dueño', async () => {
    await assertFails(setDoc(doc(asA(), 'users/userA/transactions/t1'), { amountMinor: 100 }))
    await assertFails(setDoc(doc(asA(), 'users/userA/secretos/s1'), { a: 1 }))
    await assertFails(getDocs(collection(asA(), 'users/userA/secretos')))
    await assertFails(setDoc(doc(asA(), 'publico/x'), { a: 1 }))
  })
})
