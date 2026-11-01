import "server-only";
import { readStorageJson, writeStorageJson } from "@/lib/storage-json";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchAll, signPhotos } from "@/lib/participants";
import { formatCedula } from "@/lib/cedula";
import { normalizeRaffleDocument } from "@/lib/raffle-eligibility";
import { cadeteId, cedulaDeId, type Cadete, type Modo } from "@/lib/cadetes";
import type { WheelParticipant } from "@/components/Wheel";

// Todo en JSON del bucket privado: no hace falta SQL nuevo en Supabase.
const MODO = "_estado/modo.json";
const LISTA = "_cadetes/lista.json";
const GANADORES = "_cadetes/ganadores.json";

export type ListaCadetes = { cadetes: Cadete[]; updated_at: string; updated_by: string };
type Ganadores = { draws: { cedula: string; at: string }[] };

// Si no se puede leer, lanza error (la TV reintenta) en vez de suponer "normal" y recargarse en pleno sorteo.
export async function readModo(): Promise<Modo> {
  const m = await readStorageJson<{ modo?: string }>(MODO);
  return m?.modo === "cadetes" ? "cadetes" : "normal";
}

export async function writeModo(modo: Modo, by: string) {
  await writeStorageJson(MODO, { modo, updated_by: by, updated_at: new Date().toISOString() });
}

export async function readCadetes(): Promise<ListaCadetes | null> {
  return readStorageJson<ListaCadetes>(LISTA);
}

export async function writeCadetes(cadetes: Cadete[], by: string) {
  await writeStorageJson(LISTA, { cadetes, updated_by: by, updated_at: new Date().toISOString() } satisfies ListaCadetes);
}

// Cédulas de los cadetes que ya ganaron, en orden de sorteo (el primero, primero).
export async function readCadetDraws(): Promise<string[]> {
  return ((await readStorageJson<Ganadores>(GANADORES))?.draws ?? []).map((d) => d.cedula);
}

// Solo el admin sortea (una pantalla a la vez): leer, agregar y guardar basta.
export async function addCadetDraw(cedula: string) {
  const cur = (await readStorageJson<Ganadores>(GANADORES))?.draws ?? [];
  if (cur.some((d) => d.cedula === cedula)) return;
  await writeStorageJson(GANADORES, { draws: [...cur, { cedula, at: new Date().toISOString() }] } satisfies Ganadores);
}

// Sin cédula: borra todos los ganadores de cadetes.
export async function removeCadetDraws(cedula: string | null) {
  const cur = (await readStorageJson<Ganadores>(GANADORES))?.draws ?? [];
  await writeStorageJson(GANADORES, { draws: cedula ? cur.filter((d) => d.cedula !== cedula) : [] } satisfies Ganadores);
}

// Cédulas de la lista de cadetes (y de los que ganaron en su ruleta): cada ruleta tiene sus propios
// participantes, así que estas personas nunca salen ni ganan en la ruleta normal.
export async function cedulasCadetes(): Promise<Set<string>> {
  const [lista, ganados] = await Promise.all([readCadetes(), readCadetDraws()]);
  return new Set([...(lista?.cadetes ?? []).map((c) => c.cedula), ...ganados]);
}

// Los cadetes se registran en la app como cualquier asistente (salen como civiles). La lista de cadetes
// los reconoce por la cédula: en la ruleta de cadetes salen solo los REGISTRADOS que están en la lista.
export type CadeteRegistrado = Cadete & { participant_id: string; photo_path: string; full_name: string; raffle_number: number; rank: string | null };
export async function cadetesRegistrados(raffleId: string | null): Promise<{ lista: Cadete[]; registrados: CadeteRegistrado[]; ganaronNormal: Set<string> }> {
  const lista = (await readCadetes())?.cadetes ?? [];
  const ganaronNormal = new Set<string>(); // cédulas de cadetes que ya ganaron en la ruleta normal
  if (!raffleId || !lista.length) return { lista, registrados: [], ganaronNormal };
  const sb = supabaseAdmin();
  // Sin cruce de ganadores: quien ya ganó en la ruleta normal (p. ej. antes de cargar la lista) no entra en la de cadetes.
  const [inscritos, premiados] = await Promise.all([
    fetchAll<{ id: string; document_number: string; photo_path: string; full_name: string; raffle_number: number; rank: string | null }>((from, to) =>
      sb.from("participants").select("id, document_number, photo_path, full_name, raffle_number, rank").eq("raffle_id", raffleId).order("raffle_number").range(from, to)),
    fetchAll<{ participant_id: string }>((from, to) => sb.from("draws").select("participant_id").eq("raffle_id", raffleId).order("id").range(from, to)),
  ]);
  const ganoNormal = new Set(premiados.map((d) => d.participant_id));
  const porCedula = new Map(lista.map((c) => [c.cedula, c]));
  const registrados: CadeteRegistrado[] = [];
  const vistos = new Set<string>();
  for (const p of inscritos) {
    const doc = normalizeRaffleDocument(p.document_number);
    const c = doc ? porCedula.get(doc) : undefined;
    if (!c || vistos.has(c.cedula)) continue;
    if (ganoNormal.has(p.id)) { ganaronNormal.add(c.cedula); continue; }
    vistos.add(c.cedula);
    registrados.push({ ...c, participant_id: p.id, photo_path: p.photo_path, full_name: p.full_name, raffle_number: p.raffle_number, rank: p.rank });
  }
  return { lista, registrados, ganaronNormal };
}

// Ruleta de cadetes: los cadetes registrados que no han ganado, y los ganadores aparte (el más reciente primero).
// En pantalla se ve igual que la ruleta normal: nombre, foto, número y grado son los del registro
// (el grado de la lista de cadetes no se muestra, para que el público no note el cambio).
export async function getCadetWheel(raffleId: string | null): Promise<{ participants: WheelParticipant[]; winners: WheelParticipant[] }> {
  const [{ registrados }, ganados] = await Promise.all([cadetesRegistrados(raffleId), readCadetDraws()]);
  if (!registrados.length) return { participants: [], winners: [] };
  const urls = await signPhotos(registrados.map((c) => c.photo_path), 12 * 60 * 60);
  const all = new Map(registrados.map((c) => [c.cedula, {
    id: cadeteId(c.cedula), name: c.full_name || c.nombre, number: c.raffle_number, rank: c.rank,
    photoUrl: urls.get(c.photo_path) ?? null, cedula: formatCedula(c.cedula),
  } satisfies WheelParticipant]));
  const won = new Set(ganados);
  return {
    participants: [...all.values()].filter((p) => !won.has(cedulaDeId(p.id) ?? "")),
    winners: [...ganados].reverse().map((c) => all.get(c)).filter((p): p is WheelParticipant => !!p),
  };
}
