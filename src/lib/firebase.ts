import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

const env = import.meta.env

const config = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
}

/** Variables obligatorias que faltan o siguen con el valor de ejemplo. */
export const missingFirebaseVars: string[] = [
  ['VITE_FIREBASE_API_KEY', config.apiKey],
  ['VITE_FIREBASE_AUTH_DOMAIN', config.authDomain],
  ['VITE_FIREBASE_PROJECT_ID', config.projectId],
  ['VITE_FIREBASE_APP_ID', config.appId],
]
  .filter(([, v]) => typeof v !== 'string' || v.trim() === '')
  .map(([k]) => k as string)

export const isFirebaseConfigured = missingFirebaseVars.length === 0

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null

if (isFirebaseConfigured) {
  app = initializeApp(config)
  auth = getAuth(app)
  auth.languageCode = 'es'
  db = getFirestore(app)
}

export function requireAuth(): Auth {
  if (!auth) throw new Error('Firebase no está configurado.')
  return auth
}

export function requireDb(): Firestore {
  if (!db) throw new Error('Firebase no está configurado.')
  return db
}
