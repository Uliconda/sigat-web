// Envío de correos con la API REST de EmailJS desde el servidor.
// Requiere los secretos EMAILJS_SERVICE_ID, EMAILJS_PUBLIC_KEY y EMAILJS_PRIVATE_KEY
// (la Private Key nunca llega al navegador).

export const SECRETOS_EMAILJS = ["EMAILJS_SERVICE_ID", "EMAILJS_PUBLIC_KEY", "EMAILJS_PRIVATE_KEY"] as const;

export function faltanSecretosEmailjs(extra: string[] = []): string[] {
  return [...SECRETOS_EMAILJS, ...extra].filter((nombre) => !Deno.env.get(nombre));
}

export async function enviarConEmailjs(templateId: string, parametros: Record<string, string>): Promise<void> {
  const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: Deno.env.get("EMAILJS_SERVICE_ID"),
      template_id: templateId,
      user_id: Deno.env.get("EMAILJS_PUBLIC_KEY"),
      accessToken: Deno.env.get("EMAILJS_PRIVATE_KEY"),
      template_params: parametros,
    }),
  });
  if (!response.ok) {
    throw new Error(`EmailJS respondió ${response.status}: ${await response.text()}`);
  }
}
