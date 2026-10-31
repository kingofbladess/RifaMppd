import "server-only";
import { supabaseEnv } from "@/lib/env";
import { retryingFetch, BUCKET_DOCS } from "@/lib/supabase";

// Estado compartido de la ruleta para la TV espejo (sin tablas nuevas): un JSON pequeño en el bucket privado.
// Guarda a qué ganador le cerró el cartel el admin, para que la TV lo cierre igual.
const PATH = "_estado/ruleta.json";
type State = { closed: string | null; at: string };

function base() {
  const { url, key } = supabaseEnv();
  if (!url || !key) throw new Error("Falta configuración de Supabase");
  return { url, headers: { Authorization: `Bearer ${key}`, apikey: key } };
}

export async function readWheelState(): Promise<State | null> {
  try {
    const { url, headers } = base();
    // Sin caché: cada consulta debe ver el último cierre.
    const r = await retryingFetch(`${url}/storage/v1/object/authenticated/${BUCKET_DOCS}/${PATH}?v=${Date.now()}`, { headers, cache: "no-store" });
    if (!r.ok) { await r.text().catch(() => ""); return null; }
    return (await r.json()) as State;
  } catch {
    return null;
  }
}

export async function writeWheelState(state: State) {
  const { url, headers } = base();
  const r = await retryingFetch(`${url}/storage/v1/object/${BUCKET_DOCS}/${PATH}`, {
    method: "POST",
    // El bucket privado solo acepta image/jpeg (con application/json Supabase responde 415 y la TV nunca se
    // enteraba del cierre). El texto se guarda declarado con ese tipo; solo lo lee la app.
    headers: { ...headers, "Content-Type": "image/jpeg", "x-upsert": "true", "cache-control": "max-age=0" },
    body: JSON.stringify(state),
  });
  if (!r.ok) throw new Error(`No se pudo guardar el estado (${r.status}): ${await r.text().catch(() => "")}`);
  await r.text().catch(() => "");
}
