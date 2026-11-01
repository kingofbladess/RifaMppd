import "server-only";
import { supabaseAdmin, BUCKET_PHOTOS } from "./supabase";
import type { WheelParticipant } from "@/components/Wheel";
import { isNetErr, readLocal, saveLocal } from "./local-cache";

// Supabase devuelve como máximo 1000 filas por consulta: esto pide página por página hasta traerlas todas.
const PAGE = 1000;
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) return all;
  }
}

// Enlaces ya firmados, reutilizados mientras les quede al menos la mitad del tiempo pedido. Sin esto el panel
// (que se refresca cada 15 s) recibía enlaces nuevos cada vez y el navegador volvía a bajar todas las fotos.
const signedCache = new Map<string, { url: string; exp: number }>();

// URLs firmadas de las fotos, en tandas. Las personas de prueba usan "temp/…" y no tienen archivo.
export async function signPhotos(paths: string[], seconds: number): Promise<Map<string, string>> {
  const real = [...new Set(paths.filter((path) => !path.startsWith("temp/")))];
  const out = new Map<string, string>();
  const now = Date.now();
  const missing = real.filter((path) => {
    const hit = signedCache.get(path);
    if (hit && hit.exp - now >= (seconds * 1000) / 2) { out.set(path, hit.url); return false; }
    return true;
  });
  const sb = supabaseAdmin();
  for (let i = 0; i < missing.length; i += PAGE) {
    const { data } = await sb.storage.from(BUCKET_PHOTOS).createSignedUrls(missing.slice(i, i + PAGE), seconds);
    (data ?? []).forEach((s) => {
      if (s.error || !s.signedUrl || !s.path) return;
      // Se entrega la ruta propia /api/foto (misma dirección que la app) con el token firmado.
      const token = new URL(s.signedUrl).searchParams.get("token");
      const url = token ? `/api/foto?p=${encodeURIComponent(s.path)}&t=${encodeURIComponent(token)}` : s.signedUrl;
      out.set(s.path, url);
      signedCache.set(s.path, { url, exp: now + seconds * 1000 });
    });
  }
  return out;
}

export async function getActiveRaffle() {
  const { data, error } = await supabaseAdmin()
    .from("raffles").select("*").eq("is_active", true)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  void saveLocal("rifa", data ?? null); // copia para abrir el registro sin internet (solo en la laptop)
  return data;
}

type Raffle = NonNullable<Awaited<ReturnType<typeof getActiveRaffle>>>;
// Para el registro: si no hay internet usa la última rifa activa conocida (los registros quedan en la cola del teléfono).
export async function getActiveRaffleOrCached(): Promise<{ raffle: Raffle | null; offline: boolean }> {
  try {
    return { raffle: await getActiveRaffle(), offline: false };
  } catch (e) {
    if (!isNetErr(e)) throw e;
    return { raffle: await readLocal<Raffle>("rifa"), offline: true };
  }
}

// Participantes de la rifa activa con URL firmada (12 h) de su foto. Nunca expone el documento.
// Los que ya ganaron salen de la ruleta y se devuelven aparte, en orden de sorteo (el más reciente primero).
export async function getWheelParticipants(): Promise<{ participants: WheelParticipant[]; winners: WheelParticipant[] }> {
  const raffle = await getActiveRaffle();
  if (!raffle) return { participants: [], winners: [] };
  const sb = supabaseAdmin();
  const [data, draws] = await Promise.all([
    fetchAll<{ id: string; full_name: string; raffle_number: number; rank: string | null; photo_path: string }>((from, to) =>
      sb.from("participants").select("id, full_name, raffle_number, rank, photo_path")
        .eq("raffle_id", raffle.id).order("raffle_number").range(from, to)),
    fetchAll<{ participant_id: string }>((from, to) =>
      sb.from("draws").select("participant_id").eq("raffle_id", raffle.id).order("created_at", { ascending: false }).range(from, to)),
  ]);
  if (!data.length) return { participants: [], winners: [] };

  // 12 h: la ruleta suele quedar abierta toda la jornada en la TV; con 1 h las fotos dejaban de verse.
  const urlByPath = await signPhotos(data.map((p) => p.photo_path), 12 * 60 * 60);
  const all = new Map(data.map((p) => [p.id, {
    id: p.id, name: p.full_name, number: p.raffle_number, rank: p.rank,
    photoUrl: urlByPath.get(p.photo_path) ?? null,
  }]));
  const won = new Set(draws.map((d) => d.participant_id));
  return {
    participants: [...all.values()].filter((p) => !won.has(p.id)),
    winners: [...new Set(draws.map((d) => d.participant_id))].map((id) => all.get(id)).filter((p): p is WheelParticipant => !!p),
  };
}
