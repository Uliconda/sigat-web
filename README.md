# SIGAT Web

Panel de administración de SIGAT. Usa Supabase Auth y PostgreSQL.

> La migración desde Firebase ya se completó. El UID original de cada cuenta se
> conserva en `profiles.firebase_uid`; el script de migración se retiró del
> proyecto (sigue disponible en el historial de Git).

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
cuentas pueden recuperar el acceso con **Restablecer contraseña** en el inicio
de sesión.

### 4. Desplegar la función de gestión de cuentas

`supabase/functions/manage-users/index.ts` crea y elimina cuentas usando el
servicio administrativo solo en el servidor. Despliega `manage-users` desde
Supabase Dashboard o Supabase CLI. Configura `APP_ORIGIN` con el origen exacto
de la app. La función usa los secretos de Supabase `SUPABASE_URL`,
`SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`; nunca los pongas en el frontend.

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

### 6. Ejecutar y verificar

```bash
npm install
npm run dev
npm run build
npm run lint
npm run test:db
```
