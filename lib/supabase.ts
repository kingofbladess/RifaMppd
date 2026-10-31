import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv, similarEnvNames } from "./env";

// Algunas redes (como la de Infopress) cortan las conexiones que quedan abiertas sin uso; la siguiente
// consulta que reutiliza una de esas conexiones falla con ECONNRESET. Se reintenta con una conexión nueva.
const RETRY_CODES = new Set(["ECONNRESET", "EPIPE", "UND_ERR_SOCKET", "ECONNREFUSED", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"]);
const STALE_CODES = new Set(["ECONNRESET", "EPIPE", "UND_ERR_SOCKET"]); // la conexión estaba muerta antes de enviar
const errCode = (e: unknown) => {
  const c = (e as { cause?: { code?: string } })?.cause;
  return c?.code ?? (e as { code?: string })?.code ?? "";
};
const retryingFetch: typeof fetch = async (input, init) => {
  const method = (init?.method ?? "GET").toUpperCase();
  const idempotent = method === "GET" || method === "HEAD";
  for (let i = 0; ; i++) {
    try {
      return await fetch(input, init);
    } catch (e) {
      const code = errCode(e);
      const ok = idempotent ? RETRY_CODES.has(code) : STALE_CODES.has(code);
      if (!ok || i >= 2) throw e;
      await new Promise((r) => setTimeout(r, 150 * (i + 1)));
    }
  }
};

// Cliente con la clave secreta: SOLO se usa en el servidor (route handlers / server components).
export function supabaseAdmin() {
  const { url, key, missing } = supabaseEnv();
  if (!url || !key) {
    const seen = similarEnvNames();
    throw new Error(
      `Faltan variables de entorno: ${missing.join(", ")}. ` +
      `Variables parecidas encontradas: ${seen.length ? seen.join(", ") : "ninguna"}. ` +
      `En Vercel: Settings > Environment Variables (marca Production) y luego Redeploy.`
    );
  }
  return createClient(url, key, { auth: { persistSession: false }, global: { fetch: retryingFetch } });
}

export const BUCKET_DOCS = "documentos";
export const BUCKET_PHOTOS = "fotos";
