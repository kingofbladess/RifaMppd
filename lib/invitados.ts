import "server-only";
import { supabaseAdmin } from "./supabase";
import { fetchAll } from "./participants";
import { isNetErr, readLocal, saveLocal } from "./local-cache";

// Dos listas por rifa, cruzadas por cédula:
// - Invitados (guests): con lista cargada, solo los inscritos que están en ella salen en la ruleta.
//   Sin lista (vacía) salen todos los inscritos, como antes.
// - Excluidos (excluded_guests): nunca salen en la ruleta, aunque estén inscritos o en la lista de invitados.
export type Invitados = Map<string, { name: string | null; rank: string | null }>;
export type Listas = { invitados: Invitados | null; excluidos: Invitados; faltaTabla: boolean };
type Fila = { document_number: string; full_name: string | null; rank: string | null };
export type TablaLista = "guests" | "excluded_guests";

// Se guarda unos segundos en memoria: la ruleta, el sorteo y cada consulta de cédula la usan.
const TTL = 20_000;
let cache: { raffleId: string; at: number; data: Listas } | null = null;
export function olvidarInvitados() { cache = null; }

// La tabla aún no existe en Supabase (falta correr el SQL de la actualización).
export const sinTabla = (e: unknown) => ["42P01", "PGRST205"].includes((e as { code?: string })?.code ?? "");
const aMapa = (rows: Fila[]): Invitados => new Map(rows.map((r) => [r.document_number, { name: r.full_name, rank: r.rank }]));

async function leer(raffleId: string, tabla: TablaLista): Promise<{ rows: Fila[]; falta: boolean }> {
  const sb = supabaseAdmin();
  try {
    const rows = await fetchAll<Fila>((from, to) => sb.from(tabla).select("document_number, full_name, rank")
      .eq("raffle_id", raffleId).order("document_number").range(from, to));
    void saveLocal(`${tabla}-${raffleId}`, rows); // copia en la laptop para avisar al operador sin internet
    return { rows, falta: false };
  } catch (e) {
    if (sinTabla(e)) return { rows: [], falta: true };
    if (isNetErr(e)) {
      const rows = await readLocal<Fila[]>(`${tabla}-${raffleId}`);
      if (rows) return { rows, falta: false };
    }
    throw e;
  }
}

export async function getInvitados(raffleId: string): Promise<Listas> {
  if (cache && cache.raffleId === raffleId && Date.now() - cache.at < TTL) return cache.data;
  const [inv, exc] = await Promise.all([leer(raffleId, "guests"), leer(raffleId, "excluded_guests")]);
  const data: Listas = {
    invitados: inv.rows.length ? aMapa(inv.rows) : null,
    excluidos: aMapa(exc.rows),
    faltaTabla: inv.falta || exc.falta,
  };
  cache = { raffleId, at: Date.now(), data };
  return data;
}

// ¿Esta cédula sale en la ruleta? No excluida y, si hay lista de invitados, que esté en ella.
export const saleEnRuleta = (l: Listas, doc: string) => !l.excluidos.has(doc) && (!l.invitados || l.invitados.has(doc));

// Grado con el que sortea: el de IPSFA/registro si se reconoce; si no, el de la lista de invitados.
export function gradoEfectivo(rank: string | null, invitado: { rank: string | null } | undefined, reconoce: (r: string | null) => boolean) {
  if (reconoce(rank) || !invitado?.rank) return rank;
  return reconoce(invitado.rank) ? invitado.rank : rank;
}
