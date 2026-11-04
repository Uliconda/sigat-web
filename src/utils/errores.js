// Mensajes de error claros para el usuario, sin pedirle que revise la consola.

const SIN_CONEXION = /failed to fetch|networkerror|network request failed|load failed/i;

// Texto para mostrar a partir de un error de Supabase, de red o de JavaScript.
export function mensajeDeError(error, respaldo = "Inténtalo de nuevo en unos momentos.") {
  if (!error) return respaldo;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "No hay conexión a internet. Revisa tu red e inténtalo de nuevo.";
  }
  const texto = String(error.message ?? error);
  if (SIN_CONEXION.test(texto)) {
    return "No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.";
  }
  if (/permission denied|row-level security/i.test(texto)) {
    return "Tu cuenta no tiene permiso para hacer este cambio.";
  }
  return texto || respaldo;
}

// Las Edge Functions responden { error: "mensaje" }; supabase-js solo expone
// "Edge Function returned a non-2xx status code". Esto recupera el mensaje real.
export async function errorDeFuncion(error) {
  const detalle = await error?.context?.json?.().catch(() => null);
  return new Error(detalle?.error || error?.message || "La operación no se pudo completar.");
}
