import "server-only";
import { readStorageJson, writeStorageJson } from "@/lib/storage-json";

// Estado compartido de la ruleta para la TV espejo (sin tablas nuevas): un JSON pequeño en el bucket privado.
// Guarda a qué ganador le cerró el cartel el admin, para que la TV lo cierre igual.
const PATH = "_estado/ruleta.json";
type State = { closed: string | null; at: string };

export async function readWheelState(): Promise<State | null> {
  try {
    return await readStorageJson<State>(PATH);
  } catch {
    return null;
  }
}

export async function writeWheelState(state: State) {
  await writeStorageJson(PATH, state);
}
