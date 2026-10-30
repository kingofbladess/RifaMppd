import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv, similarEnvNames } from "./env";

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
  return createClient(url, key, { auth: { persistSession: false } });
}

export const BUCKET_DOCS = "documentos";
export const BUCKET_PHOTOS = "fotos";
