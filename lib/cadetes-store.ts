import "server-only";
import { readStorageJson, writeStorageJson } from "@/lib/storage-json";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchAll, signPhotos, getWheelParticipants } from "@/lib/participants";
import { formatCedula } from "@/lib/cedula";
import { normalizeRaffleDocument } from "@/lib/raffle-eligibility";
import { cadeteId, type Cadete, type Modo } from "@/lib/cadetes";
import type { WheelParticipant } from "@/components/Wheel";
import { gradoDe } from "@/lib/grados";

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

// Quién NO participa en la ruleta normal: los de la lista de cadetes (salvo un "colado" registrado con
// grado militar, que va a la normal) y quien ya ganó en la ruleta de cadetes (sin cruce de ganadores).
export async function excluidosRuletaNormal(): Promise<(documento: string, rank: string | null) => boolean> {
  const [lista, ganados] = await Promise.all([readCadetes(), readCadetDraws()]);
  const enLista = new Set((lista?.cadetes ?? []).map((c) => c.cedula));
  const ganaron = new Set(ganados);
  return (documento, rank) => {
    const doc = normalizeRaffleDocument(documento);
    if (!doc) return false;
    return ganaron.has(doc) || (enLista.has(doc) && !gradoDe(rank));
  };
}

// Los cadetes se registran en la app como cualquier asistente (salen como civiles). La lista de cadetes
// los reconoce por la cédula: en la ruleta de cadetes salen solo los REGISTRADOS que están en la lista.
export type CadeteRegistrado = Cadete & { participant_id: string; photo_path: string; full_name: string; raffle_number: number; rank: string | null };
export async function cadetesRegistrados(raffleId: string | null): Promise<{ lista: Cadete[]; registrados: CadeteRegistrado[]; ganaronNormal: Set<string>; conGrado: Set<string> }> {
  const lista = (await readCadetes())?.cadetes ?? [];
  const ganaronNormal = new Set<string>(); // cédulas de cadetes que ya ganaron en la ruleta normal
  const conGrado = new Set<string>(); // en la lista pero registrados con grado militar: no son cadetes, van a la normal
  if (!raffleId || !lista.length) return { lista, registrados: [], ganaronNormal, conGrado };
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
    // En la ruleta de cadetes solo hay cadetes: un "colado" registrado con grado militar no entra.
    if (gradoDe(p.rank)) { conGrado.add(c.cedula); continue; }
    if (ganoNormal.has(p.id)) { ganaronNormal.add(c.cedula); continue; }
    vistos.add(c.cedula);
    registrados.push({ ...c, participant_id: p.id, photo_path: p.photo_path, full_name: p.full_name, raffle_number: p.raffle_number, rank: p.rank });
  }
  return { lista, registrados, ganaronNormal, conGrado };
}

// Quién se dibuja en la ruleta (igual en los dos modos, para que se vea idéntica): todos los inscritos que no
// han ganado en ninguna de las dos ruletas. Quién puede GANAR lo decide el servidor al sortear.
export async function ruletaVisible(): Promise<{ participants: WheelParticipant[]; winners: WheelParticipant[]; ganadosCadetes: string[] }> {
  const [base, ganadosCadetes] = await Promise.all([getWheelParticipants(), readCadetDraws()]);
  const won = new Set(ganadosCadetes);
  return {
    participants: base.participants.filter((p) => !won.has(normalizeRaffleDocument(p.cedula) ?? "")),
    winners: base.winners,
    ganadosCadetes,
  };
}

// Ruleta de cadetes: se ve igual que la normal (todos los inscritos que no han ganado, mismas fotos), pero solo
// puede ganar un cadete de la lista. A los cadetes se les da el id "cad-<cédula>" (así los reconoce el sorteo,
// la TV y "quitar ganador") y el grado "Cadete" (solo se ve en el cartel del ganador).
// drawIds: TODOS los sorteos guardados, también los de alguien que ya no se dibuja (lo quitaron de la lista,
// borraron su registro o se registró con grado). La TV los necesita: si no, cree que son sorteos nuevos y se recarga sin parar.
export async function getCadetWheel(raffleId: string | null): Promise<{ participants: WheelParticipant[]; winners: WheelParticipant[]; drawIds: string[] }> {
  const [{ participants: visibles }, { registrados }, ganados] = await Promise.all([
    ruletaVisible(), cadetesRegistrados(raffleId), readCadetDraws(),
  ]);
  const cadetes = new Set(registrados.map((c) => c.cedula));
  const comoCadete = (p: WheelParticipant): WheelParticipant => {
    const doc = normalizeRaffleDocument(p.cedula);
    return doc && cadetes.has(doc) ? { ...p, id: cadeteId(doc), rank: "Cadete" } : p;
  };
  // Ganadores de cadetes (el más reciente primero), con sus datos del registro.
  const ganadoresDatos = registrados.length ? await datosPorCedula(raffleId, ganados) : new Map<string, WheelParticipant>();
  return {
    // Una cédula de cadete registrada dos veces se dibuja una sola vez (el id "cad-<cédula>" debe ser único).
    participants: visibles.map(comoCadete).filter((p, i, all) => !p.id.startsWith("cad-") || all.findIndex((q) => q.id === p.id) === i),
    winners: [...ganados].reverse().map((c) => ganadoresDatos.get(c)).filter((p): p is WheelParticipant => !!p)
      .map((p) => ({ ...p, id: cadeteId(normalizeRaffleDocument(p.cedula) ?? ""), rank: "Cadete" })),
    drawIds: ganados.map(cadeteId),
  };
}

// Datos para el carrusel de ganadores de cadetes (nombre, foto, cédula) a partir de sus cédulas.
async function datosPorCedula(raffleId: string | null, cedulas: string[]): Promise<Map<string, WheelParticipant>> {
  const out = new Map<string, WheelParticipant>();
  if (!raffleId || !cedulas.length) return out;
  const buscadas = new Set(cedulas);
  const sb = supabaseAdmin();
  const inscritos = await fetchAll<{ id: string; document_number: string; photo_path: string; full_name: string; raffle_number: number; rank: string | null }>((from, to) =>
    sb.from("participants").select("id, document_number, photo_path, full_name, raffle_number, rank").eq("raffle_id", raffleId).order("id").range(from, to));
  const propios = inscritos.filter((p) => buscadas.has(normalizeRaffleDocument(p.document_number) ?? ""));
  const urls = await signPhotos(propios.map((p) => p.photo_path), 12 * 60 * 60);
  for (const p of propios) {
    const doc = normalizeRaffleDocument(p.document_number)!;
    out.set(doc, { id: p.id, name: p.full_name, number: p.raffle_number, rank: p.rank, photoUrl: urls.get(p.photo_path) ?? null, cedula: formatCedula(doc) });
  }
  return out;
}
