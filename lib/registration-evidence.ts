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
