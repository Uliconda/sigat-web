// Orígenes permitidos para llamar a las Edge Functions desde el navegador.
// APP_ORIGIN acepta uno o varios separados por comas, por ejemplo:
//   APP_ORIGIN=http://localhost:5173,http://192.168.1.246:5173,https://sigat.midominio.mx

export function allowedOrigins(): string[] {
  return (Deno.env.get("APP_ORIGIN") ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

// Una solicitud sin Origin (cron, curl, servidor) no es de un navegador: la
// autorización la decide la función con el token o el secreto.
export function isOriginAllowed(origin: string) {
  return !origin || allowedOrigins().includes(origin);
}

export function getCorsHeaders(origin = ""): Record<string, string> {
  const origins = allowedOrigins();
  return {
    "Access-Control-Allow-Origin": origins.includes(origin) ? origin : origins[0] ?? "",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

export function jsonResponse(body: unknown, status = 200, origin = "") {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
  });
}
