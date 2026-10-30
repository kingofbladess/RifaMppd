import "server-only";
import { createClient } from "@supabase/supabase-js";

// Cliente con service_role: SOLO se usa en el servidor (route handlers / server components).
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

export const BUCKET_DOCS = "documentos";
export const BUCKET_PHOTOS = "fotos";
