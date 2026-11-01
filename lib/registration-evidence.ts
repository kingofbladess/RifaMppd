export type RegistrationOrigin = "list_only" | "list_operator" | "other" | "list_unverified";
export const ORIGIN_LABELS: Record<RegistrationOrigin, string> = {
  list_only: "Solo lista de rifa",
  list_operator: "Lista + operador",
  other: "Registro por otra vía",
  list_unverified: "Lista · confirmación no disponible",
};
export function registrationEvidence(fromList: boolean, confirmationsAvailable: boolean, confirmed: boolean): RegistrationOrigin {
  if (!fromList) return "other";
  if (!confirmationsAvailable) return "list_unverified";
  return confirmed ? "list_operator" : "list_only";
}

// La pertenencia a la lista y el origen del registro son evidencias distintas.
// Un registro previo por otra vía cuenta igual que una confirmación posterior.
export function listRegistrationChecks(origin: RegistrationOrigin | undefined, inList: boolean, registered = true): 0 | 1 | 2 | null {
  if (!inList) return 0;
  if (!registered) return 1;
  if (origin === "other" || origin === "list_operator") return 2;
  if (origin === "list_only") return 1;
  return null;
}
export const CHECK_LABELS = { 1: "Solo lista, sin registro por otra vía", 2: "Lista y registro por otra vía o confirmado" };
export function listRegistrationLabel(origin: RegistrationOrigin | undefined, inList: boolean, registered = true): string {
  const checks = listRegistrationChecks(origin, inList, registered);
  if (checks === 1 || checks === 2) return `${"✅".repeat(checks)} ${CHECK_LABELS[checks]}`;
  if (checks === null) return "Por verificar";
  return origin ? ORIGIN_LABELS[origin] : "Sin verificar";
}
