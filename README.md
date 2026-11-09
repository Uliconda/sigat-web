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

El enlace de "¿Olvidaste tu contraseña?" lo genera Supabase Auth, pero el correo
lo envía la Edge Function `recuperar-contrasena` con EmailJS (el SMTP de
Supabase estaba en el modo de prueba de Resend, que solo entrega al dueño de la
cuenta). La función responde igual exista o no el correo y limita los intentos
(1 por minuto y 5 por hora por correo, 20 por hora por IP).

1. **URLs permitidas:** están en `supabase/config.toml` (`[auth]`). Al publicar
   la web en otro dominio, agrégalo ahí y en `APP_ORIGIN`, y ejecuta
   `npx supabase config push` (solo envía lo que el archivo declara).
2. **Plantilla:** en EmailJS crea una plantilla con
   `supabase/functions/recuperar-contrasena/plantilla-correo.html`
   (To Email: `{{correo_destino}}`) y pon su ID en `EMAILJS_TEMPLATE_RECUPERACION`.
3. **Despliegue:** aplica las migraciones (`npx supabase db push`), carga los
   secretos y ejecuta `npx supabase functions deploy recuperar-contrasena`.

Los usuarios que no son administradores también pueden restablecer su
contraseña desde la web; al terminar se les indica que entren en la app móvil.

### 4. Desplegar la función de gestión de cuentas

`supabase/functions/manage-users/index.ts` crea y elimina cuentas usando el
servicio administrativo solo en el servidor. Despliega `manage-users` desde
Supabase Dashboard o Supabase CLI. Configura `APP_ORIGIN` con los orígenes
desde donde se abre la app, separados por comas (por ejemplo
`http://localhost:5173,http://192.168.1.246:5173,https://sigat.midominio.mx`). La función usa los secretos de Supabase `SUPABASE_URL`,
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

### 6. Notificaciones de préstamos (correos)

Los correos a alumnos se envían desde la Edge Function
`supabase/functions/notificaciones-prestamos`, nunca desde el navegador. La
función marca como falta los préstamos con más de 48 h (excepto la categoría
ADMINISTRATIVOS), envía el aviso con EmailJS y lo registra en el historial.
Las marcas manuales y los reenvíos del Dashboard también pasan por ella.

1. **EmailJS** → *Account > Security*: activa **Allow EmailJS API for
   non-browser applications** y **Use Private Key**. Con esto, la clave pública
   ya no basta para enviar correos con tu cuenta.
2. **Aplica la migración** `supabase/migrations/20261104000000_alertas_prestamos.sql`
   en el SQL Editor (o con `npx supabase db push`).
3. **Configura los secretos** y despliega la función:

   ```powershell
   # Llena supabase/functions/.env (ignorado por Git) y súbelo:
   npx supabase secrets set --env-file supabase/functions/.env
   npx supabase functions deploy notificaciones-prestamos manage-users
   ```

   Variables: `APP_ORIGIN` (lista separada por comas), `EMAILJS_SERVICE_ID`,
   `EMAILJS_TEMPLATE_ID`, `EMAILJS_PUBLIC_KEY`, `EMAILJS_PRIVATE_KEY` y
   `CRON_SECRET`. La plantilla del correo está en
   `supabase/functions/notificaciones-prestamos/plantilla-correo.html`.
   Opcionales: `ALUMNOS_EMAIL_DOMAIN` (por defecto `cesba-queretaro.edu.mx`) y
   `HORAS_LIMITE_PRESTAMO` (por defecto `48`). Para generar `CRON_SECRET` puedes
   usar `node -e "console.log(crypto.randomUUID() + crypto.randomUUID())"`.
4. **Programa la revisión cada hora**: edita `supabase/cron/alertas-prestamos.sql`
   con la URL del proyecto y el mismo `CRON_SECRET`, y ejecútalo una vez en el
   SQL Editor. Revisa las ejecuciones con
   `select * from cron.job_run_details order by start_time desc limit 10;`.

Si un correo falla, el equipo vuelve a "Prestado" y se reintenta en la siguiente
hora. Los préstamos sin matrícula se marcan como falta y el historial indica que
no se pudo enviar el correo. Cada préstamo nuevo reinicia su alerta
automáticamente (trigger `equipos_reiniciar_alerta`).

### Personal administrativo

Aplica `supabase/migrations/20261106000000_personal_administrativo.sql` en el
SQL Editor (o con `npx supabase db push`). Crea:

- `personal_administrativo`: nombre, departamento, fecha de ingreso, fecha de
  término y conducta en el uso del equipo (`Excelente`, `Buena`, `Regular`,
  `Mala`). Lo consultan todas las cuentas; solo administradores dan de alta o
  editan.
- `asignaciones_equipo`: historial de qué equipo tuvo cada persona y cuándo.
  Nadie lo escribe directamente: los triggers de `equipos` abren una asignación
  cuando un equipo recibe `personal_id` y la cierran al devolverlo, darlo de
  baja, reasignarlo o eliminarlo, venga el cambio de la app, la web o SQL.

Después aplica `supabase/migrations/20261107000000_eliminar_personal.sql`. Agrega
la función `eliminar_personal(p_id)`, que usan los administradores para borrar
para siempre a una persona junto con su historial de asignaciones. No se permite
mientras la persona tenga equipo asignado.

La app móvil los administra desde el menú › **Personal administrativo**, y en
los equipos de la categoría ADMINISTRATIVOS el botón **Asignar** elige a la
persona de esa lista.

En la web, el menú › **Personal Administrativo** muestra al personal agrupado
por departamento con su equipo actual e historial, y genera un reporte PDF de
una, varias o todas las áreas (opcionalmente con el historial de equipos y el
personal que ya no labora).

### 7. Ejecutar y verificar

```bash
npm install
npm run dev
npm run build
npm run lint
npm run test:db
```
