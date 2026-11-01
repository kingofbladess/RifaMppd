import { supabaseEnv } from "@/lib/env";
import { retryingFetch, BUCKET_PHOTOS } from "@/lib/supabase";

export const runtime = "nodejs";

// Las fotos pasan por la app en vez de que el navegador las baje directo de Supabase: en la red de
// Infopress las conexiones del navegador a internet se cortan, pero el servidor (laptop o Vercel) las
// trae con su conexión estable y con reintento. Sigue haciendo falta el token firmado que genera la app.
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const path = params.get("p") ?? "";
  const token = params.get("t") ?? "";
  if (!/^[\w-]+(\/[\w-]+)*\.(jpg|jpeg|png|webp)$/i.test(path) || !token) return new Response("Foto inválida", { status: 400 });
  const { url } = supabaseEnv();
  if (!url) return new Response("Sin configuración", { status: 500 });
  const r = await retryingFetch(
    `${url}/storage/v1/object/sign/${BUCKET_PHOTOS}/${path}?token=${encodeURIComponent(token)}`,
    { cache: "no-store" },
  ).catch(() => null);
  if (!r?.ok || !r.body) return new Response("Foto no disponible", { status: r?.status === 400 ? 403 : 502 });
  return new Response(r.body, {
    headers: {
      "Content-Type": r.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "private, max-age=43200, immutable", // el enlace cambia con cada token (12 h): la precarga de la ruleta lo deja guardado
    },
  });
}
