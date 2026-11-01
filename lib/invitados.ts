import "server-only";
import { supabaseAdmin } from "./supabase";
import { fetchAll } from "./participants";
import { isNetErr, readLocal, saveLocal } from "./local-cache";

// Lista de invitados de la rifa: solo los inscritos cuya cédula está en la lista salen en la ruleta.
// Sin lista cargada (vacía) salen todos los inscritos, como antes.
export type Invitados = Map<string, { name: string | null; rank: string | null }>;
type Fila = { document_number: string; full_name: string | null; rank: string | null };

// Se guarda unos segundos en memoria: la ruleta, el sorteo y cada consulta de cédula la usan.
const TTL = 20_000;
let cache: { raffleId: string; at: number; data: Invitados | null; falta?: boolean } | null = null;
export function olvidarInvitados() { cache = null; }

// La tabla aún no existe en Supabase (falta correr el SQL de la actualización).
const sinTabla = (e: unknown) => ["42P01", "PGRST205"].includes((e as { code?: string })?.code ?? "");

export async function getInvitados(raffleId: string): Promise<{ invitados: Invitados | null; faltaTabla: boolean }> {
  if (cache && cache.raffleId === raffleId && Date.now() - cache.at < TTL) return { invitados: cache.data, faltaTabla: !!cache.falta };
  const sb = supabaseAdmin();
  try {
    const rows = await fetchAll<Fila>((from, to) => sb.from("guests").select("document_number, full_name, rank")
      .eq("raffle_id", raffleId).order("document_number").range(from, to));
    const data: Invitados | null = rows.length ? new Map(rows.map((r) => [r.document_number, { name: r.full_name, rank: r.rank }])) : null;
    cache = { raffleId, at: Date.now(), data };
    void saveLocal(`invitados-${raffleId}`, rows); // copia en la laptop para avisar al operador sin internet
    return { invitados: data, faltaTabla: false };
  } catch (e) {
    if (sinTabla(e)) {
      cache = { raffleId, at: Date.now(), data: null, falta: true };
      return { invitados: null, faltaTabla: true };
    }
    if (isNetErr(e)) {
      const rows = await readLocal<Fila[]>(`invitados-${raffleId}`);
      if (rows) return { invitados: rows.length ? new Map(rows.map((r) => [r.document_number, { name: r.full_name, rank: r.rank }])) : null, faltaTabla: false };
    }
    throw e;
  }
}

// Grado con el que sortea: el de IPSFA/registro si se reconoce; si no, el de la lista de invitados.
export function gradoEfectivo(rank: string | null, invitado: { rank: string | null } | undefined, reconoce: (r: string | null) => boolean) {
  if (reconoce(rank) || !invitado?.rank) return rank;
  return reconoce(invitado.rank) ? invitado.rank : rank;
}
