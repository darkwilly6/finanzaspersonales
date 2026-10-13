import { missingFirebaseVars } from '../../lib/firebase'
import { Logo } from '../../components/layout/Logo'

export function SetupRequired() {
  return (
    <main className="setup">
      <div className="setup-card">
        <Logo />
        <h1>Falta conectar Firebase</h1>
        <p>
          Capital OS guarda tus datos en tu propio proyecto de Firebase. Esta copia aún no tiene la configuración,
          así que no puede iniciar sesión ni guardar nada.
        </p>
        <p className="muted">Variables que faltan:</p>
        <ul className="mono-list">
          {missingFirebaseVars.map((v) => (
            <li key={v}><code>{v}</code></li>
          ))}
        </ul>
        <h2>Qué hacer</h2>
        <ol>
          <li>Crea un proyecto en la consola de Firebase y registra una app web.</li>
          <li>Copia <code>.env.example</code> a <code>.env.local</code> y pega los valores de tu app web.</li>
          <li>Activa Authentication con correo y contraseña, y crea la base de datos Firestore.</li>
          <li>Reinicia <code>npm run dev</code>. En GitHub Pages, define las mismas variables en Settings &gt; Secrets and variables &gt; Actions &gt; Variables.</li>
        </ol>
        <p className="muted small">El archivo README.md tiene la guía completa, paso a paso.</p>
      </div>
    </main>
  )
}
