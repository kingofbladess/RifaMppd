import "server-only";
import { supabaseAdmin, BUCKET_PHOTOS } from "./supabase";

export type WheelParticipant = { id: string; name: string; number: number; rank: string | null; photoUrl: string | null };

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

// URLs firmadas de las fotos, en tandas. Las personas de prueba usan "temp/…" y no tienen archivo.
export async function signPhotos(paths: string[], seconds: number): Promise<Map<string, string>> {
  const real = [...new Set(paths.filter((path) => !path.startsWith("temp/")))];
  const out = new Map<string, string>();
  const sb = supabaseAdmin();
  for (let i = 0; i < real.length; i += PAGE) {
    const { data } = await sb.storage.from(BUCKET_PHOTOS).createSignedUrls(real.slice(i, i + PAGE), seconds);
    (data ?? []).forEach((s) => { if (!s.error && s.signedUrl && s.path) out.set(s.path, s.signedUrl); });
  }
  return out;
}

export async function getActiveRaffle() {
  const { data, error } = await supabaseAdmin()
    .from("raffles").select("*").eq("is_active", true)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

// Participantes de la rifa activa con URL firmada (1 h) de su foto. Nunca expone el documento.
export async function getWheelParticipants(): Promise<WheelParticipant[]> {
  const raffle = await getActiveRaffle();
  if (!raffle) return [];
  const sb = supabaseAdmin();
  const data = await fetchAll<{ id: string; full_name: string; raffle_number: number; rank: string | null; photo_path: string }>((from, to) =>
    sb.from("participants").select("id, full_name, raffle_number, rank, photo_path")
      .eq("raffle_id", raffle.id).order("raffle_number").range(from, to));
  if (!data.length) return [];

  const urlByPath = await signPhotos(data.map((p) => p.photo_path), 60 * 60);

  return data.map((p) => ({
    id: p.id, name: p.full_name, number: p.raffle_number, rank: p.rank,
    photoUrl: urlByPath.get(p.photo_path) ?? null,
  }));
}
