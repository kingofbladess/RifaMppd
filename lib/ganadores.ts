import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchAll, getActiveRaffle, signPhotos } from "@/lib/participants";
import { readStorageJson } from "@/lib/storage-json";
import { normalizeRaffleDocument } from "@/lib/raffle-eligibility";
import { formatCedula } from "@/lib/cedula";

// Ganadores de las dos ruletas (normal y cadetes), en orden de sorteo, para el informe y el Excel.
export type Ganador = {
  orden: number; ruleta: "Principal" | "Cadetes"; nombre: string; cedula: string; grado: string;
  numero: number | null; hora: string; photoPath: string | null; photoUrl: string | null;
};

export async function informeGanadores(conFotos: boolean): Promise<{ rifa: string; ganadores: Ganador[] }> {
  const raffle = await getActiveRaffle();
  if (!raffle) return { rifa: "", ganadores: [] };
  const sb = supabaseAdmin();
  type P = { id: string; full_name: string; document_number: string; rank: string | null; raffle_number: number; photo_path: string };
  const [inscritos, draws, cad] = await Promise.all([
    fetchAll<P>((from, to) => sb.from("participants").select("id, full_name, document_number, rank, raffle_number, photo_path")
      .eq("raffle_id", raffle.id).order("id").range(from, to)),
    fetchAll<{ participant_id: string; created_at: string }>((from, to) => sb.from("draws").select("participant_id, created_at")
      .eq("raffle_id", raffle.id).order("created_at").range(from, to)),
    readStorageJson<{ draws?: { cedula: string; at: string }[] }>("_cadetes/ganadores.json"),
  ]);
  const porId = new Map(inscritos.map((p) => [p.id, p]));
  const porCedula = new Map(inscritos.map((p) => [normalizeRaffleDocument(p.document_number) ?? p.document_number, p]));
  const fila = (ruleta: Ganador["ruleta"], p: P | undefined, cedula: string, hora: string): Ganador => ({
    orden: 0, ruleta, nombre: p?.full_name ?? "(registro borrado)", cedula: formatCedula(p?.document_number ?? cedula),
    grado: ruleta === "Cadetes" ? "Cadete" : (p?.rank?.trim() || "Civil"), numero: p?.raffle_number ?? null, hora,
    photoPath: p?.photo_path ?? null, photoUrl: null,
  });
  const normal = draws.map((d) => { const p = porId.get(d.participant_id); return fila("Principal", p, p?.document_number ?? "", d.created_at); });
  const cadetes = (cad?.draws ?? []).map((d) => fila("Cadetes", porCedula.get(d.cedula), d.cedula, d.at));
  const ganadores = [...normal, ...cadetes].sort((a, b) => a.hora.localeCompare(b.hora)).map((g, i) => ({ ...g, orden: i + 1 }));
  if (conFotos) {
    const urls = await signPhotos(ganadores.map((g) => g.photoPath).filter((p): p is string => !!p), 12 * 60 * 60);
    ganadores.forEach((g) => { g.photoUrl = g.photoPath ? urls.get(g.photoPath) ?? null : null; });
  }
  return { rifa: raffle.name, ganadores };
}

// Hora de Venezuela (UTC-4).
export const horaVe = (iso: string) => new Date(iso).toLocaleString("es-VE", { timeZone: "America/Caracas", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
