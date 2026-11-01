// Cédula legible para la TV: solo dígitos → con puntos de miles (12345678 → 12.345.678).
// Si trae letras (pasaporte, etc.) se deja tal cual, sin el prefijo V-/E- que algunos escriben.
export function formatCedula(doc: string | null | undefined): string {
  const raw = (doc ?? "").trim().replace(/^[VEve]\s*-?\s*/, "");
  const digits = raw.replace(/[.\s-]/g, "");
  return /^\d+$/.test(digits) ? digits.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".") : raw;
}
