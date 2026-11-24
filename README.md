# SIGAT Web

[![CI](https://github.com/Uliconda/sigat-web/actions/workflows/ci.yml/badge.svg)](https://github.com/Uliconda/sigat-web/actions/workflows/ci.yml)
![Versión](https://img.shields.io/badge/versión-1.6.1-FF6F00)

Panel de administración y reportes del **Sistema de Gestión de Activos (SIGAT)**
del CESBA. Comparte la base de datos de Supabase con la app móvil
[SIGAT Móvil](https://github.com/Uliconda/sigat-movil), y este repositorio
contiene el backend de ambos: migraciones, Edge Functions y tarea programada.

**Secciones:** Dashboard · Inventario · Usuarios · Mantenimiento · Personal
Administrativo · Generador de QR (`/qr`).

**Tecnologías:** React 19 · TypeScript · Vite 7 · Supabase (Auth, PostgreSQL +
RLS, Realtime, Edge Functions) · EmailJS · jsPDF · SheetJS.

## Requisitos

- Node.js **24** o superior.
- Un proyecto de Supabase (la CLI se usa con `npx supabase`, no hay que instalarla).
- Una cuenta de EmailJS para los correos.

## Inicio rápido

```bash
git clone https://github.com/Uliconda/sigat-web.git
cd sigat-web
npm install
cp .env.example .env.local   # y llena la clave
npm run dev                  # http://localhost:5173 (también expuesto en la red local)
```

`.env.local`:

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

Usa solo la clave **publishable**. Nunca pongas `service_role` ni claves
`secret` con prefijo `VITE_`: se incluirían en el navegador.

Si el proyecto de Supabase ya está configurado, con esto basta. Para uno
nuevo, sigue la siguiente sección.

## Configurar Supabase (primera vez)

### 1. Base de datos

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

Aplica las migraciones de `supabase/migrations/` en orden:

| Migración | Contenido |
|---|---|
| `20261020000000_initial_schema.sql` | `equipos`, `historial`, `carpetas`, `profiles`, RLS, Realtime y funciones de sincronización de la app móvil |
| `20261104000000_alertas_prestamos.sql` | Alertas de préstamos vencidos |
| `20261105000000_estados_fijos.sql` | Catálogo fijo de estados |
| `20261105120000_recuperacion_contrasena.sql` | Límite de intentos de restablecimiento |
| `20261106000000_personal_administrativo.sql` | `personal_administrativo` y `asignaciones_equipo` (llenada por triggers) |
| `20261107000000_eliminar_personal.sql` | Función `eliminar_personal(p_id)` |
| `20261119000000_edificios.sql` | Catálogo `edificios`/`espacios`, ubicación de cada equipo y asignación masiva (`asignar_ubicacion`) |
| `20261119120000_areas.sql` | Tercer nivel `areas` (departamento / área dentro de un espacio) y `asignar_ubicacion` con área |

También se pueden ejecutar a mano, en ese orden, desde el **SQL Editor**; son
re-ejecutables.

### 2. Primer administrador

Nadie puede entrar sin un perfil en `profiles`. Crea el usuario en
**Authentication › Users** y después, en el SQL Editor:

```sql
insert into public.profiles (id, nombre, email, rol)
select id, 'Nombre Apellido', email, 'superadmin'
from auth.users where email = 'correo@dominio.mx';
```

Roles: `usuario` (presta y recibe), `admin` (administra) y `superadmin`
(además elimina). Las demás cuentas se crean desde la sección **Usuarios**.

### 3. Secretos de las Edge Functions

Crea `supabase/functions/.env` (ignorado por Git):

| Variable | Uso |
|---|---|
| `APP_ORIGIN` | Orígenes permitidos, separados por comas (ej. `http://localhost:5173,https://sigat.midominio.mx`) |
| `EMAILJS_SERVICE_ID` | Servicio de EmailJS |
| `EMAILJS_PUBLIC_KEY`, `EMAILJS_PRIVATE_KEY` | Claves de la cuenta de EmailJS |
| `EMAILJS_TEMPLATE_ID` | Plantilla de préstamos vencidos |
| `EMAILJS_TEMPLATE_RECUPERACION` | Plantilla de restablecer contraseña |
| `CRON_SECRET` | Autentica la revisión automática. Genéralo con `node -e "console.log(crypto.randomUUID() + crypto.randomUUID())"` |
| `ALUMNOS_EMAIL_DOMAIN` | Opcional. Por defecto `cesba-queretaro.edu.mx` |
| `HORAS_LIMITE_PRESTAMO` | Opcional. Por defecto `48` |
| `VIGENCIA_ENLACE` | Opcional. Texto de vigencia en el correo de restablecimiento; por defecto `1 hora` |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta
Supabase; no hace falta definirlos.

### 4. EmailJS

1. En *Account › Security* activa **Allow EmailJS API for non-browser
   applications** y **Use Private Key**.
2. Crea dos plantillas con estos archivos (To Email: `{{correo_destino}}` en la
   de recuperación) y pon sus IDs en los secretos:
   - `supabase/functions/notificaciones-prestamos/plantilla-correo.html` → `EMAILJS_TEMPLATE_ID`
   - `supabase/functions/recuperar-contrasena/plantilla-correo.html` → `EMAILJS_TEMPLATE_RECUPERACION`

### 5. Desplegar funciones y configuración de Auth

```bash
npx supabase secrets set --env-file supabase/functions/.env
npx supabase functions deploy manage-users notificaciones-prestamos recuperar-contrasena
npx supabase config push
```

| Función | Qué hace |
|---|---|
| `manage-users` | Crea y elimina cuentas y valida el cambio de contraseña inicial |
| `notificaciones-prestamos` | Marca como falta los préstamos de más de 48 h (excepto ADMINISTRATIVOS), envía el aviso y lo registra en el historial |
| `recuperar-contrasena` | Envía el enlace de restablecimiento (1 intento/min y 5/h por correo, 20/h por IP) |

`config push` envía las URLs de redirección de `supabase/config.toml`
(`[auth]`). **Al publicar la web en un dominio**, agrégalo ahí y en
`APP_ORIGIN`, y vuelve a ejecutar `secrets set` y `config push`.

### 6. Revisión automática de préstamos

Edita `supabase/cron/alertas-prestamos.sql` con tu `<project-ref>` y el mismo
`CRON_SECRET`, y ejecútalo **una sola vez** en el SQL Editor. Programa la
revisión cada hora. Para ver las ejecuciones:

```sql
select * from cron.job_run_details order by start_time desc limit 10;
```

Si un correo falla, el equipo vuelve a "Prestado" y se reintenta a la hora
siguiente.

## Contraseñas temporales (cuentas importadas de Firebase)

Solo aplica a perfiles con `firebase_uid` que aún no recibieron contraseña. Con
`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en la terminal:

```bash
npm run set:temporary-passwords
```

Asigna una contraseña aleatoria a cada cuenta, obliga a cambiarla al entrar y
la muestra una sola vez. Entrégalas por un canal privado; no guardes la salida.
Volver a ejecutarlo no afecta a las cuentas ya procesadas.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compila a `dist/` |
| `npm run preview` | Sirve la compilación |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript estricto |
| `npm run test:web` | Pruebas de la web |
| `npm run test:db` | Prueba el esquema en PostgreSQL embebido (PGlite) |

GitHub Actions ejecuta lint, tipos, build y ambas pruebas en cada push a `main`
y en cada pull request.

## Estructura

```
src/
  pages/        Una página por sección (Dashboard, Inventory, Users, ...)
  components/   Sidebar, ProtectedRoute, modales de reportes
  context/      Sesión (AuthProvider) y tema claro/oscuro
  services/     Acceso a Supabase y suscripciones en tiempo real
  utils/        Reportes PDF/Excel, mantenimiento, personal
supabase/
  migrations/   Esquema compartido con la app móvil
  functions/    Edge Functions
  cron/         Programación de la revisión de préstamos
  tests/        Pruebas del esquema
scripts/        set-temporary-passwords.mjs
docs/           Historial de la migración a Supabase
```

El detalle de la migración desde Firebase y los cambios posteriores está en
[`docs/MIGRACION-SUPABASE.md`](docs/MIGRACION-SUPABASE.md).

## Autor

**Ing. Ulises González Hernández** · ulises.dev.hdz@gmail.com
