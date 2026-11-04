// Escapa texto antes de insertarlo en plantillas HTML (SweetAlert, ventanas de impresión).
// Evita que un nombre como `<img onerror=...>` se ejecute como código.
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
