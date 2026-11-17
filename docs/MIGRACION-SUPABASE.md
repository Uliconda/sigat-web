# SIGAT Web — Documentación de cambios desde la migración a Supabase

Periodo documentado: **3 al 10 de noviembre de 2026** (commits `17e5ec0` → `8ac0c53`, pull requests #1 a #8).
Versión de la web: `1.6.1`.

Este documento cubre el panel web **y el backend compartido** (base de datos, Edge
Functions y tareas programadas), porque el esquema de Supabase vive en este
repositorio. Lo propio de la app móvil está en
`sigat-movil/docs/MIGRACION-SUPABASE.md`.

## Índice

1. [Resumen](#1-resumen)
2. [Antes y después](#2-antes-y-después)
3. [Línea de tiempo](#3-línea-de-tiempo)
4. [Backend en Supabase](#4-backend-en-supabase)
5. [Cambios en el panel web](#5-cambios-en-el-panel-web)
6. [Errores corregidos](#6-errores-corregidos)
7. [Seguridad](#7-seguridad)
8. [Calidad: pruebas y CI](#8-calidad-pruebas-y-ci)
9. [Configuración y despliegue](#9-configuración-y-despliegue)
10. [Pendientes y observaciones](#10-pendientes-y-observaciones)

---

## 1. Resumen

SIGAT Web dejó Firebase (Auth + Firestore) y ahora usa **Supabase** (Auth,
PostgreSQL con RLS, Realtime y Edge Functions), la misma base que la app móvil.
A partir de la migración se hizo además:

- **Reglas de negocio en el servidor**: permisos por rol, validación de estados,
  IDs `EQ-XXX` sin duplicados, carpetas y control de concurrencia para el modo
  sin conexión de la app.
- **Correos desde el servidor**: los avisos de préstamos vencidos y el
  restablecimiento de contraseña salen de Edge Functions, no del navegador.
- **Módulo de Personal administrativo** con historial automático de asignaciones.
- **TypeScript estricto** en toda la web, estilos en archivos CSS y diseño
  adaptable a celular con modo oscuro.
- **Rendimiento**: el JavaScript inicial bajó de 1,530 KB a ~500 KB.
- **Pruebas y CI**: 68 verificaciones del esquema, 23 pruebas de la web y
  GitHub Actions en cada push y pull request.

## 2. Antes y después

| Tema | Antes (Firebase) | Ahora (Supabase) |
|---|---|---|
| Autenticación | Firebase Auth | Supabase Auth; `profiles` guarda nombre, rol y `firebase_uid` original |
| Datos | Firestore | PostgreSQL (`equipos`, `historial`, `carpetas`, `profiles`, …) |
| Permisos | En la interfaz | RLS y funciones de PostgreSQL; la interfaz solo refleja |
| Tiempo real | Listeners de Firestore | Supabase Realtime, una suscripción compartida por tabla |
| Correos de vencidos | Desde el navegador con `@emailjs/browser` (claves en el código) | Edge Function + `pg_cron` cada hora, clave privada en el servidor |
| Restablecer contraseña | Correo de Firebase | Edge Function `recuperar-contrasena` + EmailJS, con límite de intentos |
| Códigos QR | Servicio externo `api.qrserver.com` | Generados en el navegador (`qrcode`) |
| Lenguaje | JavaScript (`.jsx`) | TypeScript estricto (`.tsx`), `allowJs` desactivado |
| Estilos | En línea dentro de los componentes | Un CSS por página + `styles/componentes.css` |
| Carpetas vacías | Equipos falsos "Plantilla Sistema" | Tabla `carpetas` |
| Pruebas | Ninguna | `test:db`, `test:web`, lint, tipos y build en CI |

## 3. Línea de tiempo

### 3 nov — Migración (directo a `main`)

| Commit | Cambio |
|---|---|
| `17e5ec0` | Esquema de Supabase compartido con la app: `profiles`, `equipos`, `historial`, RLS, `update_equipo`, funciones `*_if_unchanged`, `next_equipo_id`, trigger de autor del historial y Edge Function `manage-users`. |
| `cbccea7` | Tabla `carpetas` y funciones `crear_carpeta` / `renombrar_carpeta` / `eliminar_carpeta`. Migra las "Plantilla Sistema" a la tabla y normaliza estados históricos. |
| `9b44427` | **Migra la web de Firebase a Supabase**: login, rutas protegidas por rol, cambio obligatorio de contraseña temporal y todas las páginas leyendo de PostgreSQL con tiempo real. Scripts de migración de datos y de contraseñas temporales. |
| `881788f` | Corrige alertas enviadas a equipos de ADMINISTRATIVOS y los botones de "Reactivar". |
| `cacf982` | Separa el contexto del tema y deja ESLint sin errores. |
| `d9e8cf3` | Excluye de Git las bases SQLite locales. |
| `4d21bfa` | Los cambios de carpetas se registran en el historial; el Excel los separa en la hoja "Carpetas". |
| `63dd8fe` | Pruebas del esquema en PostgreSQL 16 (PGlite) y CI con GitHub Actions. |

### 4 nov — PR #1 `mejoras-web`

| Commit | Cambio |
|---|---|
| `ed0d12a` | Vulnerabilidades en 0 (`npm audit`), SheetJS 0.20.3, QR generado localmente, escape de HTML en diálogos e impresión, corrección `user.uid` → `user.id`, se retiran `firebase-admin` y el script de migración. |
| `8dab350` | Avisos de préstamos vencidos desde Supabase (Edge Function + `pg_cron`). |

### 4 nov — PR #2 `fase-3-rendimiento-diseno`

| Commit | Cambio |
|---|---|
| `56f20d6` | Carga bajo demanda, `realtimeStore`, logo en WebP, diseño responsive, modo oscuro según el sistema, pantallas de carga/error/acceso denegado y pruebas de la web. |

### 4 nov — PR #3 `estilos-por-pagina`

| Commit | Cambio |
|---|---|
| `49baa69` | Estilos en línea → archivos CSS por página y componentes compartidos. |
| `2c8e8c8` | Estados fijos: restricción en la base y constantes `ESTADOS` en la web. |
| `c5095a9` | Configura TypeScript estricto y migra servicios, utilidades, contextos y componentes. Node 24. |

### 4–5 nov — PR #4 `paginas-typescript`

| Commit | Cambio |
|---|---|
| `2d00e03` `3254393` `d6a8b4f` `bf1da7a` | Mantenimiento, QR, Login y Usuarios a TypeScript. |
| `38889b8` | Inventario a TypeScript; corrige el número de serie en la exportación P-Touch. |
| `1dbb5cb` | Dashboard a TypeScript y `allowJs` desactivado: ya no queda JavaScript. |

### 5–6 nov — PR #5 `recuperar-contrasena`

| Commit | Cambio |
|---|---|
| `4949323` | Restablecer contraseña con Edge Function + EmailJS y límite de intentos. |
| `948a78d` | Corrige el Dashboard en blanco al abrir la web por la IP de la red. |
| `35b2179` | Contraseña mínima unificada en 6 caracteres. |

### 6–10 nov — PR #6, #7 y #8 `personal-administrativo`

| Commit | Cambio |
|---|---|
| `be140cd` | Tablas `personal_administrativo` y `asignaciones_equipo` con triggers. |
| `ef0f574` | Función `eliminar_personal`. |
| `49292a9` | Página de Personal, diálogo de reporte de inventario, reporte PDF de personal e inventario ordenado por ID. |
| `5410fe4` | Mejoras del Dashboard y pantalla de Mantenimiento ampliada. |

## 4. Backend en Supabase

Todo está en `supabase/`. Las migraciones se aplican en orden con
`npx supabase db push` (o pegándolas en el SQL Editor) y se pueden volver a
ejecutar sin duplicar nada.

### 4.1 Tablas

| Tabla | Contenido | Quién lee | Quién escribe |
|---|---|---|---|
| `profiles` | Cuenta: nombre, email, rol (`usuario`, `admin`, `superadmin`), `firebase_uid`, `must_change_password` | La propia cuenta y los administradores | Administradores (no pueden modificar superadmins) y `manage-users` |
| `equipos` | `id` (`EQ-XXX`) + `data` en JSONB | Cuentas con acceso SIGAT | Alta y edición: admin. Préstamo/devolución: cualquier cuenta, mediante `update_equipo`. Eliminar: solo superadmin |
| `historial` | Movimientos (`data` JSONB + `fecha`) | Cuentas con acceso SIGAT | El autor lo pone el trigger `historial_stamp_author` |
| `carpetas` | Árbol Categoría › Subcategoría › Sección (`nivel` 1–3, nombre en mayúsculas) | Cuentas con acceso SIGAT | Solo mediante funciones del servidor |
| `personal_administrativo` | Nombre, departamento, fechas de ingreso y término, conducta (`Excelente`, `Buena`, `Regular`, `Mala`) y notas | Cuentas con acceso SIGAT | Administradores |
| `asignaciones_equipo` | Qué equipo tuvo cada persona, desde y hasta cuándo, condición al devolver | Cuentas con acceso SIGAT | Nadie directamente: lo mantienen los triggers de `equipos` |
| `solicitudes_recuperacion` | Intentos de restablecer contraseña (correo como hash, IP) | Solo `service_role` | Solo `service_role` |

Tiempo real habilitado en `equipos`, `historial`, `carpetas`, `profiles`,
`personal_administrativo` y `asignaciones_equipo`.

### 4.2 Migraciones

| Archivo | Qué agrega |
|---|---|
| `20261020000000_initial_schema.sql` | `profiles`, `equipos`, `historial`, `carpetas`, RLS, funciones de roles, `update_equipo`, `*_if_unchanged`, `next_equipo_id`, funciones de carpetas y triggers `equipos_sync_carpetas` e `historial_stamp_author`. |
| `20261104000000_alertas_prestamos.sql` | `reclamar_prestamos_vencidos`, `liberar_alerta_prestamo`, `fecha_prestamo_equipo` y trigger `equipos_reiniciar_alerta`. |
| `20261105000000_estados_fijos.sql` | Restricción `equipos_estado_valido` y trigger `equipos_a_preparar_estado`, que normaliza variantes y pone "Disponible" por defecto. |
| `20261105120000_recuperacion_contrasena.sql` | Tabla `solicitudes_recuperacion`, `registrar_solicitud_recuperacion` y `nombre_para_recuperacion`. |
| `20261106000000_personal_administrativo.sql` | Tablas de personal y asignaciones, triggers `equipos_b_preparar_personal` y `equipos_sincronizar_asignacion`, y `update_equipo` acepta `personal_id`. |
| `20261107000000_eliminar_personal.sql` | `eliminar_personal(p_id)`. |

### 4.3 Funciones principales

**Roles** — `current_sigat_role`, `has_sigat_access`, `is_sigat_admin`,
`is_sigat_superadmin`. Las usan las políticas RLS y el resto de funciones.

**Equipos**

- `update_equipo`: valida en el servidor qué campos puede cambiar un usuario
  normal y que el cambio de estado sea válido.
- `update_equipo_if_unchanged` / `delete_equipo_if_unchanged`: aplican el cambio
  solo si el equipo sigue en la versión que la app esperaba; si no, devuelven
  conflicto. Son la base del modo sin conexión de la app móvil.
- `next_equipo_id`: reserva el siguiente `EQ-XXX` de forma atómica.

**Carpetas** — `crear_carpeta`, `renombrar_carpeta`, `eliminar_carpeta` (solo
administradores). Actualizan todos los equipos de la carpeta en una sola
transacción y registran un movimiento de tipo `carpeta` en el historial. El
trigger `equipos_sync_carpetas` crea las carpetas que use cualquier equipo.

**Estados** — valores permitidos: `Disponible`, `Prestado`, `Sin entregar`,
`No responde`, `Fuera de Servicio`. Cualquier variante (`"PRESTADO"`,
`" prestado "`) se normaliza antes de guardar; otro valor se rechaza.

**Alertas de préstamos** (solo `service_role`)

- `reclamar_prestamos_vencidos`: marca cada préstamo de más de 48 h una sola
  vez (`UPDATE … RETURNING` atómico).
- `liberar_alerta_prestamo`: permite reintentar si el correo falla.
- Trigger `equipos_reiniciar_alerta`: cada préstamo nuevo reinicia su alerta.

**Personal** — un equipo se asigna guardando `personal_id` en `equipos.data`
con estado "Prestado". Los triggers abren una asignación cuando aparece
`personal_id` y la cierran al devolver, dar de baja, reasignar o eliminar el
equipo, venga el cambio de la app, la web o SQL. `eliminar_personal` borra a la
persona con su historial de asignaciones; no se permite si tiene equipo asignado.

### 4.4 Edge Functions

| Función | JWT | Acciones |
|---|---|---|
| `manage-users` | Requerido | `create` y `delete` de cuentas (solo superadmin crea administradores o elimina superadmins) y `set-initial-password` para el cambio obligatorio de contraseña temporal. |
| `notificaciones-prestamos` | No (valida dentro) | `revisar-vencidos` (cron con `x-cron-secret`, o un administrador), `marcar-falta` y `reenviar-correo` (administradores). |
| `recuperar-contrasena` | No (pública) | Genera el enlace oficial (`auth.admin.generateLink`) y lo envía con EmailJS. Responde igual exista o no la cuenta. |

Código compartido en `functions/_shared/`: `cors.ts` (`APP_ORIGIN` con varios
orígenes separados por comas) y `emailjs.ts`. Cada función de correo guarda su
plantilla en `plantilla-correo.html`.

### 4.5 Tarea programada

`supabase/cron/alertas-prestamos.sql` programa con `pg_cron` + `pg_net` la
revisión de vencidos **cada hora** (`0 * * * *`). La URL de la función y el
secreto se guardan cifrados en Vault.

Flujo: el cron llama a la función → se reclaman los préstamos de más de 48 h →
se envía el correo al alumno (`matrícula@cesba-queretaro.edu.mx`) → si falla, el
equipo vuelve a "Prestado" y se reintenta en la siguiente hora. Los préstamos
sin matrícula se marcan como falta y el historial indica que no se pudo enviar.
Los equipos de la categoría ADMINISTRATIVOS quedan excluidos.

## 5. Cambios en el panel web

### 5.1 Estructura actual

```
src/
  pages/        Login, Dashboard, Inventory, Users, Maintenance, Personal, QrGenerator (+ un .css cada una)
  components/   Sidebar, ProtectedRoute, PantallaEstado, ModalReporte, DialogoReporteInventario
  services/     supabaseData.ts (lecturas y escrituras), realtimeStore.ts (tiempo real compartido)
  context/      AuthProvider, ThemeProvider, useAuth
  constants/    estados.ts, contrasena.ts
  utils/        excel, pdf, reporteInventario, reportePersonal, mantenimiento, personal, areasInventario, errores, html
  styles/       componentes.css (encabezados, tarjetas, tablas, etiquetas, botones)
  types.ts      Modelo del dominio, alineado con la app móvil
supabase/       migrations, functions, cron, tests, config.toml
scripts/        set-temporary-passwords.mjs
```

Rutas: `/` (login, pública) y, solo para `admin` y `superadmin`, `/dashboard`,
`/inventario`, `/usuarios`, `/mantenimiento`, `/personal` y `/qr`. Cualquier
otra URL vuelve al inicio.

### 5.2 Autenticación

- Inicio de sesión con Supabase Auth y rutas protegidas por rol.
- Las cuentas importadas de Firebase recibieron una contraseña temporal
  (`npm run set:temporary-passwords`) y deben cambiarla al entrar
  (`profiles.must_change_password`).
- "¿Olvidaste tu contraseña?" ya no exige escribir antes el correo. El enlace se
  detecta al iniciar la app y se avisa si venció o ya se usó.
- Las cuentas que no son de administrador pueden restablecer su contraseña en
  la web; al terminar se cierra su sesión y se les indica usar la app móvil.
- Contraseña mínima de 6 caracteres en web, `manage-users` y Supabase Auth
  (`src/constants/contrasena.ts`).

### 5.3 Rendimiento y tiempo real

- Cada página se descarga al abrirla (`React.lazy`); jsPDF y SheetJS solo al
  exportar. JS inicial: 1,530 KB → ~500 KB.
- `realtimeStore`: una conexión por tabla, aplica solo la fila que cambió,
  recarga tras reconectar y descarga los datos aunque el WebSocket no conecte.
- El Dashboard usa los últimos 90 días de historial.
- Logo en WebP (383 KB → 14 KB), favicon y `apple-touch-icon`.

### 5.4 Diseño

- Responsive: en celular el menú lateral es una barra superior con menú
  deslizable; tablas con desplazamiento horizontal; tarjetas y gráficas adaptables.
- Modo oscuro según el sistema operativo y sin destello al cargar.
- Tokens de estilo compartidos con la app móvil.
- Sin estilos en línea: colores por estado mediante clases CSS.
- Pantallas de carga, error y acceso denegado con botón de cerrar sesión.
- Mensajes de error con el motivo real, incluidos los de Edge Functions.

### 5.5 Páginas

**Dashboard**

- Tarjeta "Fuera de servicio" para que los contadores cuadren con el total, y
  porcentaje de cada estado.
- Un color fijo por estado en tarjetas, dona y tabla; tooltips legibles en modo
  oscuro; mensajes cuando no hay datos.
- Ejes con números enteros, barras horizontales para nombres largos y horarios
  pico sin huecos.
- "Marcar falta" y "Reenviar correo" pasan por la Edge Function.

**Inventario**

- Orden ascendente por ID.
- Diálogo de reporte de inventario en PDF.
- Excel con SheetJS 0.20.3: una hoja de movimientos de equipos y otra de "Carpetas".
- Exportación para etiquetas P-Touch con el número de serie correcto.

**Mantenimiento**

- Filtros por estado, buscador y panel de detalles con el historial de
  mantenimientos de cada equipo.
- Formulario con tipo, piezas, condición y responsable.
- El aviso "N equipos con mantenimiento URGENTE" lleva a la lista filtrada y
  resalta los equipos.
- Una sola regla de urgencia en `utils/mantenimiento.ts` (antes el aviso y la
  pantalla usaban 90 y 360 días).

**Personal Administrativo** (nueva)

- Personal agrupado por departamento, con su equipo actual e historial.
- Reporte PDF de una, varias o todas las áreas, opcionalmente con el historial
  de equipos y el personal que ya no labora.

**Usuarios** — alta y baja mediante `manage-users`; no se puede cambiar el
propio rol ni eliminarse a uno mismo.

**Generador de QR** — los códigos se generan en el navegador.

## 6. Errores corregidos

| Problema | Causa | Commit |
|---|---|---|
| Se enviaban alertas por equipos administrativos | Se excluía "ADMINISTRATIVO" pero la categoría es "ADMINISTRATIVOS" | `881788f` |
| Un equipo "FUERA DE SERVICIO" mostraba botones de prestar | Comparación sensible a mayúsculas | `881788f` |
| Un administrador podía cambiar su propio rol o eliminarse | Se usaba `user.uid` (Firebase) en lugar de `user.id` | `ed0d12a` |
| Correos a `desconocido@…` | Préstamos sin matrícula | `8dab350` |
| Retirar una falta la volvía a marcar en la siguiente revisión | La revisión corría en el navegador sin estado en el servidor | `8dab350` |
| Los errores del historial del Dashboard nunca se reportaban | — | `56f20d6` |
| El CSV de P-Touch ponía "---" en el número de serie | Leía `numeroSerie`; el campo es `no_serie` | `38889b8` |
| Los usuarios no recibían el correo de restablecer contraseña | El SMTP de Supabase estaba en el modo de prueba de Resend | `4949323` |
| Dashboard en blanco al abrir por `http://192.168.x.x` | `crypto.randomUUID` solo existe en HTTPS o localhost | `948a78d` |
| Tres mínimos distintos de contraseña (12, 8 y 6) | Reglas duplicadas | `35b2179` |
| Archivos que solo se diferenciaban por mayúsculas (`AuthContext`/`authContext`) | Ambiguo en Windows, se rompe en Linux | `c5095a9` |

## 7. Seguridad

- **Permisos en el servidor**: RLS en todas las tablas; un usuario normal solo
  puede prestar y devolver, y eliminar equipos es exclusivo del superadmin.
- **Autoría real**: el trigger del historial pone el autor; no se puede
  registrar a nombre de otra persona.
- **Sin claves privadas en el navegador**: el frontend solo usa la clave
  *publishable*. La `service_role` y la Private Key de EmailJS viven en los
  secretos de las Edge Functions; se eliminaron las claves de EmailJS que
  estaban en el código.
- **Restablecimiento de contraseña**: misma respuesta exista o no la cuenta;
  1 solicitud por minuto y 5 por hora por correo, 20 por hora por IP; el correo
  se guarda como hash.
- **Alertas**: las funciones solo las ejecuta `service_role`; el cron se
  autentica con `x-cron-secret` guardado en Vault.
- **XSS**: se escapan nombres, IDs y correos insertados en SweetAlert y en la
  ventana de impresión del QR (`utils/html.ts`).
- **Dependencias**: `npm audit` en 0; `xlsx` de npm reemplazado por el paquete
  oficial de SheetJS.
- **Git**: `.env.local`, `supabase/functions/.env` y las bases `*.sqlite` están
  excluidos.

## 8. Calidad: pruebas y CI

| Comando | Qué verifica | Resultado al 14 nov 2026 |
|---|---|---|
| `npm run test:db` | Aplica el esquema en PostgreSQL 16 (PGlite) y prueba migración, idempotencia, carpetas, permisos por rol, estados, alertas y recuperación de contraseña | 68 correctas |
| `npm run test:web` | Constantes de estados, `realtimeStore`, áreas de inventario, mantenimiento y personal | 23 correctas |
| `npm run typecheck` | TypeScript estricto | Sin errores |
| `npm run lint` | ESLint + typescript-eslint | Sin errores |
| `npm run build` | Compilación con Vite | — |

GitHub Actions (`.github/workflows/ci.yml`) ejecuta los cinco pasos con Node 24
en cada push a `main` y en cada pull request.

## 9. Configuración y despliegue

**Frontend** — `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

**Secretos de las Edge Functions** — `supabase/functions/.env` (ignorado por Git):

| Variable | Uso |
|---|---|
| `APP_ORIGIN` | Orígenes permitidos, separados por comas |
| `EMAILJS_SERVICE_ID`, `EMAILJS_PUBLIC_KEY`, `EMAILJS_PRIVATE_KEY` | Envío de correos |
| `EMAILJS_TEMPLATE_ID` | Plantilla de préstamos vencidos |
| `EMAILJS_TEMPLATE_RECUPERACION` | Plantilla de restablecer contraseña |
| `CRON_SECRET` | Autentica la revisión automática |
| `ALUMNOS_EMAIL_DOMAIN` (opcional) | Por defecto `cesba-queretaro.edu.mx` |
| `HORAS_LIMITE_PRESTAMO` (opcional) | Por defecto `48` |
| `VIGENCIA_ENLACE` (opcional) | Texto de vigencia en el correo de restablecer contraseña; por defecto `1 hora` |

**Orden de despliegue**

1. `npx supabase db push` — aplica las seis migraciones.
2. `npx supabase secrets set --env-file supabase/functions/.env`
3. `npx supabase functions deploy manage-users notificaciones-prestamos recuperar-contrasena`
4. `npx supabase config push` — URLs de redirección de `config.toml`.
5. Ejecutar una vez `supabase/cron/alertas-prestamos.sql` en el SQL Editor.
6. En EmailJS: activar *Allow EmailJS API for non-browser applications* y *Use Private Key*.

Al publicar la web en otro dominio hay que agregarlo en `config.toml` y en
`APP_ORIGIN`. El detalle de cada paso está en el `README.md`.

## 10. Pendientes y observaciones

- **Pruebas del módulo de Personal**: `supabase/tests/schema.test.mjs` no cubre
  las migraciones `20261106…` y `20261107…` (tablas, triggers de asignación y
  `eliminar_personal`).
- **URLs de producción**: `config.toml` solo declara `localhost` y la IP local
  `192.168.1.246`; falta el dominio definitivo.
- **Cambio sin subir**: en la copia local, `package.json` agrega `@supabase/ssr`
  y sube `@supabase/supabase-js` a `^2.119.0`. Ningún archivo de `src/` importa
  `@supabase/ssr`.
- **Finales de línea**: en la copia local los 80 archivos aparecen como
  modificados porque están en CRLF y el repositorio los guarda en LF; el
  contenido es idéntico salvo `package.json` y `package-lock.json`.
- **`/qr`** tiene ruta pero no aparece en el menú lateral.
- La numeración de secciones del `README.md` salta en "Personal administrativo"
  (no tiene número).
