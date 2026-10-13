# Capital OS

Centro de control financiero para finanzas personales y de varios negocios.
React + TypeScript + Vite · Firebase Authentication · Cloud Firestore · GitHub Pages.

> **Versión 1.0.** Guía para publicarla paso a paso: [GUIA_FIREBASE_Y_GITHUB.md](GUIA_FIREBASE_Y_GITHUB.md). Ver [Qué funciona hoy](#10-qué-funciona-hoy).

## 1. Requisitos

- Node.js 22 o superior y npm.
- Una cuenta de Google (Firebase) y una cuenta de GitHub.
- Java 21 solo si quieres correr las pruebas de reglas en tu equipo.

## 2. Configurar Firebase (una sola vez)

1. Entra a <https://console.firebase.google.com> y crea un proyecto (puedes desactivar Google Analytics).
2. **Registrar app web:** Configuración del proyecto (engranaje) > Tus apps > icono `</>`. Pon un apodo y registra. Copia el objeto `firebaseConfig`.
3. **Authentication:** Compilación > Authentication > Comenzar > Método de acceso > activa **Correo electrónico/contraseña**.
4. **Plantillas en español (opcional):** Authentication > Plantillas > elige el idioma Español en verificación y restablecimiento de contraseña.
5. **Firestore:** Compilación > Firestore Database > Crear base de datos > **modo producción** y la ubicación más cercana a ti. La ubicación no se puede cambiar después.
6. **Dominios autorizados:** Authentication > Configuración > Dominios autorizados > agrega `TU_USUARIO.github.io`. (`localhost` ya viene incluido.)
7. **Restringe la API key (recomendado):** en Google Cloud Console > APIs y servicios > Credenciales > tu clave de navegador > Restricciones de sitios web > agrega `https://TU_USUARIO.github.io/*` y `http://localhost:*`.

> La configuración web de Firebase **no es secreta**. La seguridad real la dan Authentication y las reglas de Firestore. Nunca subas cuentas de servicio ni claves privadas.

## 3. Publicar las reglas de seguridad

Las reglas viven en `firebase/firestore.rules`. Despliégalas con la CLI de Firebase:

```bash
npx firebase-tools login
npx firebase-tools use --add          # elige tu proyecto
npx firebase-tools deploy --only firestore:rules,firestore:indexes
```

**Sin este paso la app no puede guardar nada.** Cada fase amplía las reglas (la 3 añade pagos fijos y tareas; la 4 añade retiro de trading, reparto por negocio, productos, ventas e impuesto cobrado): si ya habías desplegado las anteriores, **vuelve a ejecutar el comando**.

## 4. Correr en local

```bash
cp .env.example .env.local     # pega los valores de tu app web
npm install
npm run dev
```

Sin `.env.local` verás una pantalla que explica qué falta; la app nunca finge tener datos.

## 5. Publicar en GitHub Pages

1. Crea un repositorio en GitHub y sube el proyecto a la rama `main`.
2. **Settings > Pages > Build and deployment > Source: GitHub Actions.**
3. **Settings > Secrets and variables > Actions > pestaña Variables > New repository variable**, una por cada valor de `.env.example`:
   `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`.
   (Son *Variables*, no *Secrets*: son datos públicos del cliente web.)
4. Cada `push` a `main` ejecuta lint, pruebas y build, y publica en `https://TU_USUARIO.github.io/NOMBRE_DEL_REPO/`.

La app usa rutas con `#` (por ejemplo `/#/configuracion`) porque GitHub Pages no soporta rutas del lado del servidor; así actualizar la página nunca da error 404. La ruta base se calcula sola con el nombre del repositorio.

## 6. Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor local |
| `npm run check` | Lint + pruebas + build |
| `npm test` | Pruebas unitarias y de interfaz |
| `npm run test:rules` | Pruebas de reglas de Firestore con el emulador (requiere Java 21) |
| `npm run build` | Compilación de producción en `dist/` |

## 7. Estructura

```text
src/
  app/            Rutas, navegación y estado del plan por fases
  components/     ui/, layout/, feedback/
  features/       auth/, dashboard/, settings/, ledger/, businesses/, accounts/, categories/, analytics/, calendar/,
                  recurring/, alerts/, trading/, products/, sales/, stock/, closing/, scaling/, export/
  domain/         types/, validation/ (Zod), calculations/ (fórmulas puras y testeadas)
  lib/            firebase.ts, userProfile.ts (acceso a datos), errors.ts, theme.ts
  styles/         global.css (tokens, temas oscuro y claro)
firebase/         firestore.rules, firestore.indexes.json
tests/rules/      pruebas de reglas (emulador)
.github/workflows/deploy.yml
```

Regla de arquitectura: la lógica financiera vive en `src/domain/calculations/`, el acceso a datos en `src/lib/`, y los componentes solo muestran. Nada de fórmulas dentro de componentes.

## 8. Modelo de datos (Fase 3)

Todo cuelga de `users/{uid}`. Los importes son **enteros en centavos** (`amountMinor`), nunca decimales.

```text
users/{uid}                         perfil y preferencias
  businesses/{id}                   nombre, tipo, forma de pago (método y frecuencia), reserva mínima,
                                    impuestos indirectos (opcional), método de inventario, estado
  accounts/{id}                     ámbito (personal | negocio), tipo, saldo inicial + fecha, estado
  categories/{id}                   ingreso | gasto, ámbito, color, activa
  transactions/{id}                 un movimiento (o un lado de una transferencia); recurringId opcional
  products/{id}                     catálogo: nombre, SKU, negocio, precio y costo por unidad (costo opcional), activo
  sales/{id}                        venta inmutable: líneas (producto, unidades, precio, costo), descuento, impuesto, ingreso propio, total
  inventoryMoves/{id}               movimientos de unidades (stock inicial, compra, venta, devolución, ajuste); inmutables
  closings/{id}                     cierre mensual por negocio ({negocio}_{AAAA-MM}); inmutable
  goals/{id}                        metas (efectivo, resultado o ingresos mensuales)
  recurring/{id}                    pago fijo (plantilla): tipo, cuenta, importe, frecuencia, inicio/fin, activo
  tasks/{id}                        tarea financiera: título, fecha límite, negocio, hecha
  auditLogs/{id}                    quién/qué/cuándo; solo se crea, nunca se edita ni se borra
```

**Principios contables**
- El saldo de una cuenta **no se guarda**: es saldo inicial + movimientos confirmados desde la fecha del saldo inicial.
- Solo los movimientos *confirmados* cambian el efectivo. Planificados, pendientes y anulados no.
- Una **transferencia** son dos documentos vinculados (`{id}_out` y `{id}_in`) creados en una sola operación atómica; se anulan juntos. En el consolidado se eliminan; viendo solo un negocio, un retiro hacia tu cuenta personal sigue apareciendo como salida de ese negocio.
- Aporte de capital, retiro del propietario, sueldo, inversión, préstamo recibido, pago de capital de préstamo e impuestos **no son ingreso ni gasto operativo**. Una devolución resta de los ingresos netos.
- El efectivo disponible **no incluye** las cuentas de inversión; se muestran aparte.
- Nada se borra: los movimientos se **anulan** con motivo; negocios, cuentas y categorías se **archivan o desactivan**. Una cuenta solo se archiva con saldo cero y sin movimientos pendientes.
- Un movimiento confirmado es **inmutable** (solo se anula). Los planificados y pendientes se pueden editar o confirmar.
- Reintentos y doble clic no duplican: cada formulario fija su id al abrirse y la escritura es "crear solo si no existe".
- **Pagos fijos:** son plantillas. Generan movimientos *planificados* con id determinista (`rec_{pago}_{fecha}`) y solo si no existen, así regenerar no duplica ni pisa tus ediciones. Mensual y anual conservan el día de inicio (31 → último día en meses cortos). Un pago fijo no se borra: se pausa.
- **Proyección de caja:** efectivo actual + planificados + pendientes + pagos fijos aún sin crear, sin contarlos dos veces. Lo vencido sin confirmar se espera hoy. No incluye ventas futuras que no hayas registrado.
- **Alertas:** se calculan al vuelo con tus datos (saldo negativo, proyección negativa, reserva mínima, vencidos, sin categoría…), nunca quedan desactualizadas y no dependen de los filtros.
- **Variaciones %:** si el periodo anterior fue 0, se muestra “sin base de comparación” y no un 0 % inventado.
- **Trading (solo lo que mueve tu dinero):** *Inversión* = depósito a un broker (capital, no es gasto). *Gasto* = cuentas de fondeo, evaluaciones y comisiones. *Retiro de trading* = dinero que recibes de un broker o de fondeo; cuenta como ingreso del negocio de trading, aparte de las ventas. No se registran operaciones ni ganancias o pérdidas: eso lo llevas donde ya lo tienes.
- **Ventas:** cada venta guarda sus líneas (producto del catálogo o escrito a mano, unidades, precio y *foto del costo de ese momento*, así cambiar el costo después no altera el historial). Genera de forma atómica un **ingreso** por lo que es tuyo y, si el negocio cobra impuestos, un movimiento aparte de **impuesto cobrado**, que entra a la cuenta pero **no es ingreso** (queda como dinero a reservar). El precio puede incluir el impuesto o sumarse aparte, elegido en cada venta con el valor por defecto del negocio; el impuesto se calcula sobre el total de la venta, en centavos enteros, y siempre cuadra: ingreso propio + impuesto = total.
- Una venta **pendiente de cobro** no cambia tu saldo hasta marcarla como cobrada. El estado de la venta se **deriva** de sus movimientos, por eso nunca los contradice. Una venta no se edita ni se borra: se **anula** (ambos movimientos a la vez) y queda en el historial.
- **Ganancia por producto:** el ingreso propio de la venta (ya sin impuesto y con el descuento repartido proporcionalmente, sin perder centavos) menos el costo de las unidades. Si a algún producto le falta el costo, la ganancia queda **sin calcular**, no en cero.
- **Cuánto te corresponde:** `computeAllocation` reparte respetando tres límites a la vez: (1) lo que el negocio ganó en el periodo (retiros − gastos de fondeo), (2) el efectivo que sobra después de la reserva mínima y de los pagos que vienen en 30 días, y (3) los porcentajes que tú definiste (reserva / reinversión / para ti, suma 100). No hay porcentajes por defecto. El reparto suma exactamente lo repartible (sin perder centavos). Nada se crea solo: los botones abren el formulario ya rellenado para que tú confirmes.
- La tabla de tratamiento de cada tipo vive en `src/domain/calculations/transactionRules.ts`; el resumen, en `summary.ts`.

## 9. Seguridad

- Las reglas solo permiten acceder a `users/{uid}/…` cuando `request.auth.uid == uid`; cualquier otra ruta está denegada.
- Validan campos permitidos, tipos, moneda `USD`, fechas, importes enteros positivos, que el ámbito del movimiento coincida con el de su cuenta, que un movimiento confirmado solo pueda anularse y que no exista borrado de datos financieros.
- La auditoría es de solo-creación.
- No hay secretos en el repositorio ni en el bundle. `.env*` está en `.gitignore` salvo `.env.example`.
- Las contraseñas las gestiona Firebase Authentication.
- La recuperación de contraseña no revela si un correo existe.
- Los filtros de la interfaz **nunca** sustituyen a las reglas: un usuario no puede leer datos ajenos aunque manipule el cliente.
- **Límite conocido de las reglas:** la coherencia entre el motivo de una transferencia y los ámbitos de sus cuentas (por ejemplo, que un retiro vaya de negocio a personal) se valida en la aplicación, no en las reglas. Las reglas sí garantizan identidad, forma de los datos e inmutabilidad.
- Pruebas de acceso cruzado y de inmutabilidad en `tests/rules/`. **Ejecútalas** con `npm run test:rules` antes de confiar en las reglas; el workflow también las corre en el job `rules`.

## 10. Qué funciona hoy

- Acceso con correo y contraseña, recuperación, verificación, rutas protegidas, perfil y temas claro/oscuro.
- Negocios, cuentas (personales y de negocio), categorías y movimientos de 14 tipos con estados, anulación con motivo, transferencias de dos lados y auditoría.
- Filtros globales por ámbito (todo, personal, uno o varios negocios) y periodo; resumen sin doble conteo.
- Inicio, Analítica (con comparación contra el periodo anterior), Calendario financiero, Pagos fijos, Alertas y tareas.
- Productos y Ventas (líneas con unidades, descuento, impuesto incluido o aparte, cobro inmediato o pendiente, anulación).
- **Stock**: control de unidades con costo promedio ponderado, compras (que no son gasto), stock inicial, devoluciones con reembolso opcional, ajustes con motivo, capital inmovilizado y alerta de reposición. Las ventas descuentan unidades y usan el costo real; no se puede vender más de lo que hay.
- **Costo de lo vendido** descontado del resultado operativo (las compras de mercancía no son gasto).
- Inversiones y trading: inversión, retiro y gasto de fondeo; neto de caja; reparto sugerido.
- **Cierre financiero** mensual por negocio: base, reserva mínima, pagos que vienen, reparto (reserva / reinversión / para ti) y calendario de tu pago según la frecuencia configurada; el cierre se guarda como registro inmutable y tú registras el pago.
- **Escalado**: comparador de negocios, metas con progreso y simulador de escenarios.
- **Exportar y respaldo**: JSON completo y CSV de movimientos y ventas.
- Reglas de Firestore y 243 pruebas unitarias y de interfaz.

**No incluido en esta versión**
- Facturas, importación de CSV de brokers o bancos, restaurar desde el respaldo, conciliación bancaria, varias monedas, varios usuarios.
- La app carga hasta 5 000 movimientos y 3 000 ventas; si se supera, avisa que los saldos pueden quedar incompletos.

## 11. Límites y costos de Firebase

El plan gratuito (Spark) tiene cuotas diarias de lecturas, escrituras y almacenamiento en Firestore, y límites en Authentication. Consulta las cifras vigentes en la página de precios de Firebase, porque cambian. Para un solo usuario es poco probable alcanzarlas, pero la app maneja el error de cuota con un mensaje claro. Las funciones que requieren servidor (correos programados, notificaciones push, cálculos privilegiados) no existen en GitHub Pages y necesitarían Cloud Functions u otro servicio, que puede requerir plan de pago; se documentará antes de implementarlas.

## 12. Respaldo y recuperación

Fase 1: los datos son solo tu perfil. Desde la Fase 7 habrá exportación a CSV y JSON desde la app. Mientras tanto, puedes exportar toda la base con la CLI:

```bash
npx firebase-tools firestore:export gs://TU_BUCKET/respaldo   # requiere plan Blaze
```

En el plan gratuito, el respaldo recomendado será la exportación JSON de la app (Fase 7).

## 13. Aviso

Capital OS ayuda a organizar y entender tus números. No reemplaza asesoría contable, fiscal ni legal, y sus proyecciones son estimaciones, no garantías.
