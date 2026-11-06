import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    "Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY. Configúralas en .env.local."
  );
}

// El enlace de "restablecer contraseña" llega con #...type=recovery (o con un
// error si venció). Se lee ANTES de crear el cliente: supabase-js procesa y
// borra esos datos de la URL al iniciar, y la pantalla de inicio de sesión se
// carga después (carga diferida), así que se perdería el evento PASSWORD_RECOVERY.
const parametrosEnlace = new URLSearchParams(
  `${window.location.hash.replace(/^#/, "")}&${window.location.search.replace(/^\?/, "")}`
);

export interface EnlaceRecuperacion {
  /** El usuario llegó desde un enlace de recuperación válido. */
  pendiente: boolean;
  /** Mensaje si el enlace venció o ya se había usado. */
  error: string | null;
}

export const enlaceRecuperacion: EnlaceRecuperacion = {
  pendiente: parametrosEnlace.get("type") === "recovery" && !parametrosEnlace.get("error"),
  error:
    parametrosEnlace.get("error_code") === "otp_expired"
      ? "El enlace para restablecer la contraseña venció o ya se usó. Solicita uno nuevo."
      : parametrosEnlace.get("error_description")
        ? "El enlace para restablecer la contraseña no es válido. Solicita uno nuevo."
        : null,
};

// Al guardar la nueva contraseña (o al cerrar sesión) el enlace deja de aplicar.
export function terminarRecuperacion(): void {
  enlaceRecuperacion.pendiente = false;
  enlaceRecuperacion.error = null;
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey);
