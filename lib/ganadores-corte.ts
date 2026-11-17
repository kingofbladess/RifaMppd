import "server-only";
import { readStorageJson, writeStorageJson } from "@/lib/storage-json";

// "Limpiar la lista de ganadores" sin borrar sorteos: se guarda desde cuándo mostrarla.
// Quien ganó antes sigue sin poder ganar otra vez; solo deja de verse en la ruleta, la TV y el informe.
const PATH = "_estado/ganadores-corte.json";
type Corte = { desde: string; updated_by: string };

export async function readCorte(): Promise<string | null> {
  return (await readStorageJson<Corte>(PATH))?.desde ?? null;
}

export async function writeCorte(by: string) {
  await writeStorageJson(PATH, { desde: new Date().toISOString(), updated_by: by } satisfies Corte);
}

// Se compara la fecha, no el texto: Supabase la entrega como "…+00:00" con microsegundos y la app como "…Z".
export const despuesDelCorte = (corte: string | null, at: string) => !corte || Date.parse(at) > Date.parse(corte);
