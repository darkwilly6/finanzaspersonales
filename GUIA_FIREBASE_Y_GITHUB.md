# Capital OS · Guía para publicar y empezar a usarla

Tiempo estimado: 30 a 45 minutos la primera vez. No necesitas programar. Sigue los pasos en orden.

## Resumen en 6 pasos

1. Crear el proyecto en **Firebase** y copiar 6 valores.
2. Activar el acceso con **correo y contraseña** y crear la base de datos.
3. Pegar las **reglas de seguridad** (obligatorio).
4. Subir el proyecto a **GitHub**.
5. Cargar los 6 valores en GitHub y activar **GitHub Pages**.
6. Autorizar tu dirección en Firebase, crear tu cuenta y empezar.

---

## Paso 1 · Crear el proyecto en Firebase

1. Entra a <https://console.firebase.google.com> con tu cuenta de Google.
2. **Crear un proyecto** → ponle un nombre (por ejemplo `capital-os`) → puedes desactivar Google Analytics → **Crear**.
3. En la pantalla del proyecto pulsa el icono **`</>` (Web)** para registrar una app web.
   - Apodo: `Capital OS`. **No** marques “Firebase Hosting”. Pulsa **Registrar app**.
4. Verás un bloque `firebaseConfig`. **Copia estos 6 valores** (los necesitarás en el paso 5):

| En Firebase aparece | Variable que debes crear en GitHub |
|---|---|
| `apiKey` | `VITE_FIREBASE_API_KEY` |
| `authDomain` | `VITE_FIREBASE_AUTH_DOMAIN` |
| `projectId` | `VITE_FIREBASE_PROJECT_ID` |
| `storageBucket` | `VITE_FIREBASE_STORAGE_BUCKET` |
| `messagingSenderId` | `VITE_FIREBASE_MESSAGING_SENDER_ID` |
| `appId` | `VITE_FIREBASE_APP_ID` |

> Estos valores **no son secretos**: identifican tu proyecto. Lo que protege tus datos son el inicio de sesión y las reglas del paso 3. Nunca subas una “cuenta de servicio” ni una clave privada.

Puedes volver a verlos en ⚙️ **Configuración del proyecto → General → Tus apps**.

## Paso 2 · Activar el acceso y crear la base de datos

1. Menú **Compilación → Authentication → Comenzar → Método de acceso → Correo electrónico/contraseña → Habilitar → Guardar**.
2. (Opcional) **Authentication → Plantillas**: cambia el idioma a **Español** en “Verificación de correo” y “Restablecimiento de contraseña”.
3. Menú **Compilación → Firestore Database → Crear base de datos**.
   - Elige **modo de producción**.
   - Ubicación: la más cercana a ti (por ejemplo `nam5 (us-central)` o `us-east1`). **No se puede cambiar después.**
   - **Habilitar**.

## Paso 3 · Pegar las reglas de seguridad (obligatorio)

Sin este paso la app no puede guardar nada, y con reglas distintas tus datos no estarían protegidos.

**Opción fácil (sin instalar nada):**

1. En Firebase: **Firestore Database → pestaña Reglas**.
2. Borra todo lo que haya.
3. Abre el archivo `firebase/firestore.rules` de este proyecto (o el `firestore.rules` que te entregué suelto), **copia todo su contenido** y pégalo.
4. Pulsa **Publicar**. Si Firebase marca un error de sintaxis, no sigas: avísame con el mensaje exacto.

**Opción con terminal** (si ya tienes Node.js 22): dentro de la carpeta del proyecto

```bash
npx firebase-tools login
npx firebase-tools use --add          # elige tu proyecto
npx firebase-tools deploy --only firestore:rules,firestore:indexes
```

> Cada vez que descargues una versión nueva de Capital OS, **vuelve a publicar las reglas**.

## Paso 4 · Subir el proyecto a GitHub

1. Crea una cuenta en <https://github.com> si no tienes.
2. **New repository** → nombre `capital-os` → **Public** → **Create repository**.
   - Por qué público: GitHub Pages gratis exige repositorio público. No hay secretos en el código; tus datos viven en Firebase y solo los ve quien inicie sesión en tu cuenta. (Con un plan de pago de GitHub puedes usarlo privado.)
3. Descomprime `capital-os.zip`. Sube la carpeta:

**Con terminal** (recomendado, conserva la carpeta oculta `.github`):

```bash
cd capital-os
git init
git add .
git commit -m "Capital OS"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/capital-os.git
git push -u origin main
```

**Sin terminal:** instala **GitHub Desktop**, usa *File → Add local repository* con la carpeta descomprimida y publícala. Verifica después en GitHub que existe `.github/workflows/deploy.yml`; si no aparece, el sitio no se publicará.

## Paso 5 · Cargar los 6 valores y activar Pages

1. En tu repositorio: **Settings → Secrets and variables → Actions → pestaña Variables → New repository variable**.
2. Crea **las 6 variables** de la tabla del paso 1 (nombre exacto y el valor que copiaste). Son **Variables**, no *Secrets*.
3. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
4. Ve a la pestaña **Actions**. Si el primer proceso ya corrió antes de crear las variables, ábrelo y pulsa **Re-run all jobs**.
5. Espera a que termine (2–4 minutos). Tu app quedará en:

`https://TU_USUARIO.github.io/capital-os/`

> En la pestaña Actions habrá un trabajo llamado **rules** (pruebas de seguridad). Si sale en rojo, **no bloquea la publicación**, pero avísame para revisarlo.

## Paso 6 · Autorizar tu dirección y empezar

1. Firebase → **Authentication → Configuración → Dominios autorizados → Agregar dominio** → `TU_USUARIO.github.io`.
2. (Recomendado) Google Cloud Console → **APIs y servicios → Credenciales** → tu “Browser key” → **Restricciones de sitios web** → agrega `https://TU_USUARIO.github.io/*` y `http://localhost:*`.
3. Abre tu dirección, **crea tu cuenta** y verifica el correo. Usa una contraseña larga y única.

---

## Cómo empezar a usarla (en este orden)

1. **Configuración**: revisa tu zona horaria.
2. **Negocios y marcas**: crea cada negocio. Define cómo te pagas (método y frecuencia), la **reserva mínima** y, si quieres, los porcentajes de **reparto** (reserva / reinversión / para ti: deben sumar 100). Activa impuestos solo si cobras IVA, y escribe tú la tasa.
3. **Cuentas y saldos**: crea cada cuenta con su **saldo inicial real** y la fecha de hoy (banco, efectivo, procesadores, billeteras, cuenta del broker si quieres). Las personales y las de cada negocio por separado.
4. **Categorías**: usa “Crear categorías sugeridas” y ajusta.
5. **Productos** (si vendes mercancía): crea tu catálogo. Si quieres control de unidades, activa **Controlar unidades en stock** y luego en **Stock** registra el **Stock inicial** de cada producto.
6. **Pagos fijos**: alquiler, suscripciones… y “Generar planificados”.
7. Día a día: botón **Registrar** (ingresos, gastos, transferencias) y **Ventas → Nueva venta**.
8. **Trading**: inversión (depósito al broker), gasto (cuentas de fondeo), retiro (lo que recibes).
9. Fin de mes: **Cierre financiero** para ver cuánto reservar, reinvertir y pagarte.
10. **Exportar y respaldo**: haz un respaldo ahora y repítelo cada mes.

**Regla de oro:** registra cada cosa en el tipo correcto (una transferencia entre tus cuentas no es ingreso ni gasto; una compra de mercancía no es gasto; un retiro tuyo no es gasto). La app te explica el tratamiento al elegir cada tipo.

## Si algo falla

| Síntoma | Causa y solución |
|---|---|
| Pantalla “Falta conectar Firebase” | Faltan variables en GitHub. Revisa las 6 (paso 5) y vuelve a ejecutar el proceso en Actions. |
| Página en blanco o 404 | Pages debe estar en **Source: GitHub Actions** y el proceso del paso 5 terminado en verde. La dirección lleva `/capital-os/` al final. |
| “El acceso con correo no está activado” | Falta el paso 2.1. |
| “Este dominio no está autorizado” | Falta el paso 6.1. |
| “No tienes permiso…” o los datos no cargan | Faltan o están mal publicadas las reglas (paso 3). |
| No llega el correo de verificación | Mira spam. Puedes usar la app sin verificar, pero verifica para poder recuperar tu cuenta. |
| Un movimiento “no se puede editar” | Los confirmados y los de una venta no se editan: **anúlalo** (con motivo) y regístralo de nuevo. |
| Dice que hay demasiados movimientos | La app carga hasta 5 000 movimientos y 3 000 ventas; avísame y activamos cierres anuales. |

## Cómo actualizar la app más adelante

1. Descarga el zip nuevo y reemplaza los archivos de tu carpeta (conserva la carpeta oculta `.git`).
2. `git add . && git commit -m "Actualización" && git push`.
3. Si hubo cambios en `firebase/firestore.rules`, **vuelve a publicarlas** (paso 3).

## Qué incluye y qué no (versión 1.0)

**Incluye:** acceso con correo y contraseña · negocios y cuentas ilimitados · movimientos de 14 tipos con transferencias entre cuentas sin doble conteo · pagos fijos · calendario y proyección de caja · alertas y tareas · ventas con productos y unidades, descuento e impuesto incluido o aparte · catálogo y ganancia por producto · stock con costo promedio ponderado, compras, devoluciones, ajustes y alerta de reposición · trading (inversión, retiro, gasto de fondeo) · reparto y cierre mensual · comparador de negocios, metas y simulador · exportación CSV y respaldo JSON · modo claro/oscuro y móvil.

**No incluye todavía:** facturas · importar CSV · restaurar desde el respaldo · conciliación con el banco · varias monedas (todo es USD) · varios usuarios en la misma cuenta.

## Seguridad en pocas líneas

- Cada persona solo puede leer y escribir sus propios datos (lo hacen cumplir las reglas del paso 3).
- Los movimientos confirmados no se borran ni se editan: se anulan con motivo y queda registro.
- Haz respaldos. Firebase tiene cuotas gratuitas diarias; para una persona sobran, pero revisa tu consumo en la consola si el uso crece.
- Esta app organiza tus números; no reemplaza a un contador ni calcula obligaciones fiscales.
