// Mensajes de error claros para el usuario, sin pedirle que revise la consola.

const SIN_CONEXION = /failed to fetch|networkerror|network request failed|load failed/i;

const textoDe = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message ?? "");
  }
  return String(error ?? "");
};

// Texto para mostrar a partir de un error de Supabase, de red o de JavaScript.
export function mensajeDeError(error: unknown, respaldo = "Inténtalo de nuevo en unos momentos."): string {
  if (!error) return respaldo;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "No hay conexión a internet. Revisa tu red e inténtalo de nuevo.";
  }
  const texto = textoDe(error);
  if (SIN_CONEXION.test(texto)) {
    return "No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.";
  }
  if (/permission denied|row-level security/i.test(texto)) {
    return "Tu cuenta no tiene permiso para hacer este cambio.";
  }
  return texto || respaldo;
}

interface ErrorConContexto {
  message?: string;
  context?: { json?: () => Promise<unknown> };
}

// Las Edge Functions responden { error: "mensaje" }; supabase-js solo expone
// "Edge Function returned a non-2xx status code". Esto recupera el mensaje real.
export async function errorDeFuncion(error: unknown): Promise<Error> {
  const conContexto = error as ErrorConContexto | null;
  const detalle = (await conContexto?.context?.json?.().catch(() => null)) as { error?: string } | null;
  return new Error(detalle?.error || conContexto?.message || "La operación no se pudo completar.");
}
