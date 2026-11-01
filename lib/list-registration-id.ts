import { createHash } from "node:crypto";

// La misma huella usada desde el primer registro automático permite reconocer los actuales.
export function listRegistrationId(raffleId: string, document: string): string {
  const hex = createHash("sha256").update(`list:${raffleId}:${document}`).digest("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}

export function createdFromRaffleList(raffleId: string, document: string, photoPath: string | null | undefined) {
  return photoPath === `${listRegistrationId(raffleId, document)}.jpg`;
}
