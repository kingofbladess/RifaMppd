import "server-only";
import { supabaseAdmin, BUCKET_PHOTOS } from "./supabase";

export type WheelParticipant = { id: string; name: string; number: number; rank: string | null; photoUrl: string | null };

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
  const { data, error } = await sb
    .from("participants").select("id, full_name, raffle_number, rank, photo_path")
    .eq("raffle_id", raffle.id).order("raffle_number");
  if (error) throw error;
  if (!data.length) return [];

  // Las personas de prueba usan "temp/…" y no tienen archivo: la ruleta muestra sus iniciales.
  const paths = data.map((p) => p.photo_path).filter((path) => !path.startsWith("temp/"));
  const { data: signed } = paths.length
    ? await sb.storage.from(BUCKET_PHOTOS).createSignedUrls(paths, 60 * 60)
    : { data: [] };
  const urlByPath = new Map((signed ?? []).filter((s) => !s.error && s.signedUrl).map((s) => [s.path, s.signedUrl]));

  return data.map((p) => ({
    id: p.id, name: p.full_name, number: p.raffle_number, rank: p.rank,
    photoUrl: urlByPath.get(p.photo_path) ?? null,
  }));
}
