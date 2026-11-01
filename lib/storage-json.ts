import "server-only";
import { supabaseEnv } from "@/lib/env";
import { retryingFetch, BUCKET_DOCS } from "@/lib/supabase";

// JSON pequeños guardados en el bucket privado (sin tablas nuevas, sin SQL que pegar en Supabase).
function base() {
  const { url, key } = supabaseEnv();
  if (!url || !key) throw new Error("Falta configuración de Supabase");
  return { url, headers: { Authorization: `Bearer ${key}`, apikey: key } };
}

// null si el archivo no existe todavía; lanza error si no se pudo leer (sin red, etc.), para no confundir
// "no hay nada guardado" con "no se pudo consultar".
export async function readStorageJson<T>(path: string): Promise<T | null> {
  const { url, headers } = base();
  // Sin caché: cada consulta debe ver lo último guardado.
  const r = await retryingFetch(`${url}/storage/v1/object/authenticated/${BUCKET_DOCS}/${path}?v=${Date.now()}`, { headers, cache: "no-store" });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    if (r.status === 404 || /not[ _-]?found/i.test(text)) return null;
    throw new Error(`No se pudo leer ${path} (${r.status})`);
  }
  return (await r.json()) as T;
}

export async function writeStorageJson(path: string, value: unknown) {
  const { url, headers } = base();
  const r = await retryingFetch(`${url}/storage/v1/object/${BUCKET_DOCS}/${path}`, {
    method: "POST",
    // El bucket privado solo acepta image/jpeg (con application/json Supabase responde 415).
    // El texto se guarda declarado con ese tipo; solo lo lee la app.
    headers: { ...headers, "Content-Type": "image/jpeg", "x-upsert": "true", "cache-control": "max-age=0" },
    body: JSON.stringify(value),
  });
  if (!r.ok) throw new Error(`No se pudo guardar ${path} (${r.status}): ${await r.text().catch(() => "")}`);
  await r.text().catch(() => "");
}
