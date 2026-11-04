# SIGAT Web

## Migración de Firebase a Supabase

La aplicación web usa Supabase Auth y PostgreSQL. Firebase Admin queda instalado
únicamente para ejecutar la migración de una sola vez. La migración no se ejecuta
al iniciar la app.

### 1. Configurar la app

`.env.local` debe contener la URL del proyecto y su clave **publishable**:

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

No uses claves `service_role` o `secret` con prefijo `VITE_`; el navegador las
expondría. `.env.local` está excluido de Git.

### 2. Crear esquema y permisos

En Supabase Dashboard abre **SQL Editor**, pega y ejecuta
[`supabase/migrations/20261020000000_initial_schema.sql`](./supabase/migrations/20261020000000_initial_schema.sql).
El script crea `equipos`, `historial` y `profiles`, configura RLS y habilita
Realtime, además de las funciones con control de concurrencia usadas por la
sincronización offline de SigatRN. Si ya ejecutaste una versión anterior,
vuelve a ejecutar el SQL completo actualizado antes de instalar la app móvil.
La app no podrá iniciar sesión correctamente hasta que exista al menos un
perfil administrador en `profiles`.

### 3. Configurar restablecimiento de contraseñas

En **Authentication > URL Configuration**, agrega la URL donde correrá la app
(por ejemplo `http://localhost:5173`) a las Redirect URLs permitidas. Las
contraseñas de Firebase no se copian: las cuentas migradas reciben contraseñas
aleatorias desconocidas y cada usuario debe usar **Restablecer contraseña** en
el inicio de sesión.

### 4. Desplegar la función de gestión de cuentas

`supabase/functions/manage-users/index.ts` crea y elimina cuentas usando el
servicio administrativo solo en el servidor. Despliega `manage-users` desde
Supabase Dashboard o Supabase CLI. Configura `APP_ORIGIN` con el origen exacto
de la app. La función usa los secretos de Supabase `SUPABASE_URL`,
`SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`; nunca los pongas en el frontend.

La creación inicial de usuarios se hace con el script de migración (paso 5), que
usa la clave de servicio localmente y no necesita esta función.

### 5. Asignar contraseñas temporales únicas

El esquema SQL añade `profiles.must_change_password`; vuelve a ejecutar el SQL
completo si esta columna aún no existe. Despliega de nuevo `manage-users`, que
valida el cambio inicial desde la sesión autenticada:

```powershell
npx supabase functions deploy manage-users
```

Con `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` configurados en la terminal,
ejecuta:

```powershell
npm run set:temporary-passwords
```

El script asigna una contraseña aleatoria diferente a cada perfil importado de
Firebase y exige que se cambie antes de acceder al panel. Las contraseñas se
muestran una sola vez en la terminal; entrégalas individualmente por un canal
privado y no compartas ni guardes la salida en el repositorio. El script marca
las cuentas procesadas para no volver a cambiarles la contraseña si se ejecuta
otra vez.

### 6. Migrar Firestore y perfiles

Primero haz una copia de seguridad de Firebase. Crea una clave de cuenta de
servicio con acceso de lectura a Firestore y Firebase Authentication, guárdala
fuera del repositorio y ejecuta desde PowerShell:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\ruta-segura\firebase-service-account.json"
$env:SUPABASE_URL = "https://<project-ref>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service-role-key>"
npm run migrate:firebase
```

El script migra `Equipos`, `Historial` y los perfiles de `Usuarios`; crea las
cuentas Supabase que falten, conserva el UID Firebase en `profiles.firebase_uid`
y transforma fechas de Firestore a ISO y a la columna PostgreSQL `historial.fecha`.
Es reejecutable para sincronizar los
datos, pero antes de repetirlo revisa que el proyecto de destino sea el correcto.
Nunca guardes la clave de servicio ni el archivo de Firebase en el repositorio.

Revisa en Supabase los conteos de las tres tablas y prueba la app antes de pedir
los restablecimientos. Configura un proveedor SMTP en Supabase Auth antes de
enviarlos en producción; el correo de prueba integrado puede tener límites
estrictos. Cuando Auth y el proveedor estén listos, puedes solicitar que se envíen:

```powershell
$env:SUPABASE_PASSWORD_RESET_REDIRECT = "http://localhost:5173"
npm run migrate:firebase -- --send-password-resets
```

Usa una URL permitida y accesible para los usuarios. El script intenta enviar un
restablecimiento por cada perfil migrado.

### 7. Ejecutar y verificar

```bash
npm install
npm run dev
npm run build
npm run lint
```

Mantén Firebase sin cambios hasta validar acceso, inventario, historial, reportes
y recuperación de contraseña en el proyecto Supabase de prueba.
